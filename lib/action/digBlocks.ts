import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { Block } from 'prismarine-block'
import { Item } from 'prismarine-item'
import { Entity } from 'prismarine-entity'
import { goals } from 'mineflayer-pathfinder'
import { sleep } from '../util/sleep';

const debug = require('debug')('MC_BOT_LIB:digBlocks');

interface digBlocksConfig{
  target_blocks:string[];
  delay:number; // tick
  maxDistance:number;
  range:Vec3[];
  terminate_entities:string[];
  danger_radius:number;
  inventory_empty_min:number;
  item_container:string;
  durability_percentage_threshold:number;
};

function remainDurability(bot:mineflayer.Bot, item:Item){
  const maxDurability = bot.registry.itemsByName[item.name].maxDurability;
  return (maxDurability-item.durabilityUsed)/maxDurability;
}

async function changeTool(bot:mineflayer.Bot, tool:string, durability_percentage_threshold:number){
  // check the tool
  bot.updateHeldItem();
  if(bot.heldItem == null || !bot.heldItem.name.includes(tool)){
    // get tool list
    const tool_dict = {
      'axe': ['netherite_axe', 'golden_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'],
      'shovel': ['netherite_shovel', 'golden_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel'],
      'pickaxe': ['netherite_pickaxe', 'golden_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe'],
      'hoe': ['netherite_hoe', 'golden_hoe', 'diamond_hoe', 'iron_hoe', 'stone_hoe', 'wooden_hoe'],
      'shears': ['shears']
    };
    let toolArray = tool_dict[tool];
    if(!toolArray){
      debug(`Can't find tool ${tool}`);
      toolArray = tool_dict['pickaxe'];
    }
    // find tool in order
    for(let i = 0; i < toolArray.length; ++i){
      let start_find_idx = bot.inventory.inventoryStart;
      while(start_find_idx < bot.inventory.inventoryEnd){
        const result = bot.inventory.findItemRangeName(start_find_idx, bot.inventory.inventoryEnd, 
          toolArray[i], null, false);
        if(result) {
          // check the durability
          const remain_durability_pct = remainDurability(bot, result);
          if(remain_durability_pct > durability_percentage_threshold){  
            await bot.equip(result, 'hand');
            break;
          }
          start_find_idx = result.slot+1;
        }else{
          break;
        }
      }
    }
  }
  if(bot.heldItem != null) {
    debug(`Bot held ${bot.heldItem.displayName} with ${remainDurability(bot, bot.heldItem)} durability`);
  }else{
    debug("Bot doesn't held anything.");
  }
}

function isBetween(ptA:number, ptB:number, val:number):boolean {
  const dist_A = Math.abs(ptA - val);
  const dist_B = Math.abs(ptB - val);
  const dist = Math.abs(ptA - ptB);
  return dist_A + dist_B <= dist;
}

function findBlocks(bot:mineflayer.Bot, target_blocks:string[]|undefined, limits:number[], range:Vec3[], canDig:boolean):Block[] {
  const targets:Block[] = [];
  const loc = bot.entity.position;
  for(let x = -limits[0]; x <= limits[0]; ++x){
    if(!isBetween(range[0].x, range[1].x, loc.x+x)) continue;
    for(let y = -limits[1]; y <= limits[1]; ++y){
      if(!isBetween(range[0].y, range[1].y, loc.y+y)) continue;
      for(let z = -limits[2]; z <= limits[2]; ++z){
        if(!isBetween(range[0].z, range[1].z, loc.z+z)) continue;
        const block = bot.blockAt(loc.offset(x, y, z));
        if(block == undefined) continue;
        if(canDig && !bot.canDigBlock(block)) continue;
        if(target_blocks == undefined || target_blocks.includes(block.name)){
          targets.push(block);
        }
      }
    }
  }
  return targets;
}

function depositItems(container:mineflayer.Chest, items:Item[]):Promise<void>{
  return new Promise((resolve, reject) => {
    debug(`Item Size: ${items.length}, Chest Item Size: ${container.containerItems().length}`);
    if(items.length == 0 || container.containerItems().length == 27){
      resolve();
      return;
    }
    const itemToDeposit = items.shift();

    container.deposit(itemToDeposit.type, null, itemToDeposit.count)
      .then(() => {
        debug(`Deposit ${itemToDeposit.displayName} x ${itemToDeposit.count}`);
        depositItems(container, items)
          .then(() => {
            resolve();
          })
          .catch(err => {
            reject(err);
          })
      })
      .catch(err => {
        reject(err);
      });
  });
}

async function onlyWaitForSpecTime(task:Promise<any>, time_limit:number, callback:()=>void):Promise<boolean>{
  let timer:NodeJS.Timeout;
  const timeout_promise = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      callback();
      resolve();
    }, time_limit);
  }).then(() => { return false; });
  return Promise.race([timeout_promise,
    task.then(() => {
      clearTimeout(timer);
      return true;
    }).catch((err) => { debug(err); return false; })
  ]);
}

export async function digBlocks(bot:mineflayer.Bot, config:digBlocksConfig):Promise<void> {
  // find all blocks nearby
  debug("============ Find Target ============");
  let targets = findBlocks(bot, config.target_blocks, 
    [config.maxDistance, config.maxDistance, config.maxDistance], config.range, true);
  debug(`Find ${targets.length} targets`);
  targets.sort((a:Block, b:Block) => {
    if(b.position.y != a.position.y){
      return b.position.y-a.position.y;
    }else{
      return bot.entity.position.xzDistanceTo(b.position) - bot.entity.position.xzDistanceTo(a.position);
    }
  });

  // find all blocks far away from me
  if(targets.length == 0){
    debug("============ Find High Target ============");
    const high_targets = findBlocks(bot, config.target_blocks, 
      [config.maxDistance, config.range[1].y-bot.entity.position.y+1, config.maxDistance], 
      config.range, false);
    debug(`High Target Size: ${high_targets.length}`);
    for(let i = 0; i < high_targets.length; ++i){
      if(high_targets[i].position.y >= bot.entity.position.y){
        debug(`Go to X: ${high_targets[i].position.x}, Z: ${high_targets[i].position.z}`);
        const isArrived = await onlyWaitForSpecTime(bot.pathfinder.goto(
          new goals.GoalXZ(high_targets[i].position.x, high_targets[i].position.z)), 20*1000, () => {
            bot.pathfinder.stop();
            debug('Exceed Time Limit, Stop Moving ~');
        });
        if(!isArrived){
          debug('Walk Failed');
          continue;
        }
        debug(`Location: ${bot.entity.position} Arrived`);
        debug('Use ctop');
        await new Promise<void>((resolve) => {
          bot.once('forcedMove', () => {
            resolve();
            debug('Move Success');
          });
          bot.chat('/ctop');
        });
        debug(`Location: ${bot.entity.position}`);
        // targets.push(high_targets[i]);
        break;
      }
    }
  }
  
  // if there is no block, then walk
  if(targets.length == 0){
    debug("No block can be digged");
    debug("============ Walk ============");
    // find blocks with a larger range
    let targets:Block[] = [];
    for(let i = 2; i <= 10; ++i){
      targets = findBlocks(bot, config.target_blocks, 
        [config.maxDistance*i, config.maxDistance*i, config.maxDistance*i], config.range, false);
      if(targets.length > 0) break;
    }
    if(targets.length == 0){
      // bot.chat('HELP !!!');
      // throw new Error("Can't find any target");
      return;
    }
    // select one randomly
    const random_target = targets[Math.floor(Math.random() * targets.length)];
    const goal_loc = random_target.position;
    debug(`Location: ${bot.entity.position}`);
    debug(`Set Goal to ${goal_loc}`);
    // walk
    debug("Try to walk");
    const isArrived = await onlyWaitForSpecTime(bot.pathfinder.goto(
      new goals.GoalLookAtBlock(goal_loc, bot.world), (err)=>{
        debug(err);
      }), 20*1000, () => {
        bot.pathfinder.stop();
        debug('Exceed Time Limit, Stop Moving ~');
    });
    if(!isArrived){
      debug('Walk Failed');
    }else{
      debug("Arrived");
    }
  }else{
    debug("============ Dig ============");
    // dig loop
    for(let i = 0; i < targets.length; i++){
      // check danger
      debug('Check Danger');
      let danger = false;
      for(const id in bot.entities){
        const en = bot.entities[id];
        // check mod type
        if(config.terminate_entities.includes(en.name) && 
            en.position.distanceTo(bot.entity.position) < config.danger_radius){
          danger = true;
          break;
        }
      }
      if(danger) break;
      // check block state
      if(!bot.canDigBlock(targets[i])) continue;
      // dig
      let tool = targets[i].material.replace('mineable/', '');
      if(tool == 'wool') tool = 'shears';
      debug('Check Tool');
      await changeTool(bot, tool, config.durability_percentage_threshold);
      try {
        debug(`Dig Target ${targets[i].displayName} At ${targets[i].position} Use ${tool}`);
        await bot.dig(targets[i]);
        debug(`Dig Done`);
      } catch (err) {
        debug(err); // Handle errors, if any
      }
      await bot.waitForTicks(config.delay);
    }
  }

  // collect
  debug("============ Collect ============");
  while(true){
    if(Object.keys(bot.entities).length == 0) break;
    if(bot.inventory.emptySlotCount() < config.inventory_empty_min) break;
    let found = false;
    for(const id in bot.entities){
      const en = bot.entities[id];
      if(en.objectType == 'Item' && bot.entity.position.y == en.position.y){
        found = true;
        debug(`Collect ${en.displayName} At ${en.position}`);
        await onlyWaitForSpecTime(bot.pathfinder.goto(
          new goals.GoalNear(en.position.x, en.position.y, en.position.z, 0.5)), 20*1000, () => {
            bot.pathfinder.stop();
            debug('Exceed Time Limit, Stop Moving ~');
        });
        await bot.waitForTicks(config.delay * 2);
        debug("Collect Done");
        break;  // find again
      }
    }
    if(!found) break;
  }

  // put items
  debug(`Empty Slot: ${bot.inventory.emptySlotCount()}`);
  if(bot.inventory.emptySlotCount() < config.inventory_empty_min){
    debug("============ Put Items ============");
    debug("Find Box");
    const box = bot.inventory.findInventoryItem(config.item_container, null, true);
    if(box){
      debug("Equip Box");
      await bot.equip(box, 'hand');
      debug("Find Location");
      const loc_block_candidates = findBlocks(bot, undefined, [config.maxDistance, 2, config.maxDistance],
        [config.range[0].offset(-1,-1,-1), config.range[1].offset(1,1,1)], true);
      let loc_block:Block = undefined;
      for(let i = 0; i < loc_block_candidates.length; ++i){
        if(loc_block_candidates[i].name != 'air' && 
            loc_block_candidates[i].name != bot.registry.itemsByName[config.item_container].name &&
            bot.canSeeBlock(loc_block_candidates[i]) &&
            bot.entity.position.distanceTo(loc_block_candidates[i].position) > 0){
          loc_block = loc_block_candidates[i];
          break;
        }
      }
      if(loc_block == undefined) throw new Error("Can't find a place to place the box");
      debug(`Place Box On ${loc_block.displayName} At ${loc_block.position.offset(0, 1, 0)}`);
      await bot.placeBlock(loc_block, new Vec3(0, 1, 0));
      debug("Place Done");
      const chest = await bot.openChest(bot.blockAt(loc_block.position.offset(0, 1, 0)));
      debug("Chest Opened");
      let deposit_items = [];
      const inventory_items = bot.inventory.items();
      for(let i = 0; i < inventory_items.length; ++i){
        if(config.target_blocks.includes(inventory_items[i].name)){
          deposit_items.push(inventory_items[i]);
        }
      }
      debug(`Deposit Item Size: ${deposit_items.length}`);
      debug("Start Deposit");
      await depositItems(chest, deposit_items);
      debug("Finish Deposit");
      chest.close();
    }else{
      debug("Can't find any box !!!");
    }
  }

  await bot.waitForTicks(config.delay);
}