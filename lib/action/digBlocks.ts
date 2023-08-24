import mineflayer, { Chest } from 'mineflayer'
import { Vec3 } from 'vec3'
import { Block } from 'prismarine-block'
import { Item } from 'prismarine-item'
import { Window } from 'prismarine-windows'
import { Entity } from 'prismarine-entity'
import { goals } from 'mineflayer-pathfinder'
import { isBetween, inside } from '../util/inside';
import { onlyWaitForSpecTime, sleep } from '../util/time';

const debug = require('debug')('MC_BOT_LIB:digBlocks');

export interface digBlocksConfig{
  target_blocks:string[];
  delay:number; // tick
  maxDistance:number;
  range:Vec3[];
  inventory_empty_min:number;
  item_container:string;
  durability_percentage_threshold:number;
  ctop:boolean;
  store_item_black_list:string[];
};

function remainDurabilityPercent(bot:mineflayer.Bot, item:Item){
  const maxDurability = bot.registry.itemsByName[item.name].maxDurability;
  return Math.round((maxDurability-item.durabilityUsed)/maxDurability*100)/100;
}

function findTool(bot:mineflayer.Bot, window:Window, toolArray:string[], 
    start_idx:number, end_idx:number, durability_percentage_threshold:number):Item{
  // find each type tool in order
  for(let i = 0; i < toolArray.length; ++i){
    let start_find_idx = start_idx;
    while(start_find_idx < end_idx){
      const result = window.findItemRangeName(start_find_idx, end_idx, 
        toolArray[i], null, false);
      if(result) {
        // check the durability
        if(durability_percentage_threshold == undefined || 
          remainDurabilityPercent(bot, result) > durability_percentage_threshold){  
          return result;
        }
        start_find_idx = result.slot+1;
      }else{
        break;
      }
    }
  }
  return null;
}

async function changeTool(bot:mineflayer.Bot, tool:string, durability_percentage_threshold:number):Promise<string> {
  // check the tool
  bot.updateHeldItem();
  if(bot.heldItem == null || !bot.heldItem.name.includes('_' + tool) || 
    remainDurabilityPercent(bot, bot.heldItem) <= durability_percentage_threshold){

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

    // find tool
    const tool_item = findTool(bot, bot.inventory, toolArray, bot.inventory.inventoryStart, 
      bot.inventory.inventoryEnd, durability_percentage_threshold);
    if(tool_item){
      debug(`Found Tool ${tool_item.displayName}`);
      await bot.equip(tool_item, 'hand');
    }else{
      debug(`There is no suitable tool...`);

      // check ender chest
      const ender_chest = bot.inventory.findInventoryItem(
        bot.registry.itemsByName['ender_chest'].id, null, true);
      if(ender_chest){
        debug('Open ender chest');
        bot.equip(ender_chest, 'hand');
        const ender_window = await new Promise<Window>(async (resolve) => {
          bot.once('windowOpen', (window:Window) => {
            debug('Window Open');
            debug(`Window: ${window.title}`);
            bot.stopDigging();
            bot.setControlState('sneak', false);
            resolve(window);
          });
          bot.setControlState('sneak', true);
          await bot.dig(bot.findBlock({matching: bot.registry.itemsByName['air'].id, count: 1}))
        });

        // change the tool
        const new_tool = findTool(bot, ender_window, toolArray, 0, ender_window.inventoryStart, 
          durability_percentage_threshold);
        debug(`New Tool: ${new_tool.displayName} At ${new_tool.slot}`);
        if(new_tool){
          const old_tool = findTool(bot, ender_window, toolArray, ender_window.inventoryStart,
            ender_window.inventoryEnd, null);
          if(old_tool){
            debug(`Old Tool: ${old_tool.displayName} At ${old_tool.slot}`);
            // transfer
            bot.clickWindow(old_tool.slot, 0, 0);
            const ender_empty_slot = ender_window.firstEmptySlotRange(0, ender_window.inventoryStart);
            debug(`Old Tool Destination: ${ender_empty_slot}`);
            bot.clickWindow(ender_empty_slot, 0, 0);
          }else{
            debug('No old tool');
          }

          // withdraw new tool
          debug(`Withdraw New Tool: ${new_tool.displayName} (${new_tool.type}, ${new_tool.metadata})`);
          // transfer
          bot.clickWindow(new_tool.slot, 0, 0);
          const ender_empty_slot = ender_window.firstEmptySlotRange(ender_window.inventoryStart, ender_window.inventoryEnd);
          if(!ender_empty_slot) throw Error('My Inventory is Full');
          debug(`New Tool Destination: ${ender_empty_slot}`);
          bot.clickWindow(ender_empty_slot, 0, 0);
          bot.closeWindow(ender_window);

          // equip new tool
          const final_tool = findTool(bot, bot.inventory, toolArray, bot.inventory.inventoryStart,
            bot.inventory.inventoryEnd, durability_percentage_threshold);
          if(final_tool) debug(`Final Tool: ${final_tool.displayName}`);
          await bot.equip(final_tool, 'hand');
          debug('Finish Changing');
        }else{
          debug('There is no new tool to exchange');
          bot.closeWindow(ender_window);
        }
      }else{
        debug("Can't find the ender chest QAQ");
      }
    }
  }
  if(bot.heldItem != null) {
    debug(`Bot held ${bot.heldItem.displayName} with ${remainDurabilityPercent(bot, bot.heldItem)} durability`);
    return bot.heldItem.displayName;
  }else{
    debug("Bot doesn't held anything.");
    return '???';
  }
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

function sortTargetsByAngelandDistance(bot:mineflayer.Bot, arr:Block[]|Entity[]){
  const bot_pos = bot.entity.position.floored();
  debug(`Bot Floor Location: ${bot_pos}`);
  const theta = function(t:Vec3){
    // calculate theta by inner product
    const base = new Vec3(1, 0, 0);
    const val = t.offset(0, -t.y, 0).minus(bot_pos.offset(0, -bot_pos.y, 0));  // ignore y
    const inner = base.innerProduct(val);
    const cosine = inner / base.norm() / val.norm();
    const th_val = Math.acos(cosine) * 180 / Math.PI;
    // find direction
    const cross = base.cross(val).y;
    return (cross >= 0 ? th_val : 360-th_val);
  }

  arr.sort((a:Block|Entity, b:Block|Entity):number => {
    if(bot_pos.offset(0, -1, 0).equals(a.position)) return 1;
    if(bot_pos.offset(0, -1, 0).equals(b.position)) return -1;
    if(bot_pos.y-1 == a.position.y && bot_pos.y-1 != b.position.y) return 1;
    if(bot_pos.y-1 != a.position.y && bot_pos.y-1 == b.position.y) return -1;
    const a_theta = theta(a.position);
    const b_theta = theta(b.position);
    if(a_theta != b_theta) return a_theta - b_theta;
    if(a.position.y != b.position.y) return b.position.y - a.position.y;
    const a_dist = bot_pos.offset(0, -1, 0).xzDistanceTo(a.position);
    const b_dist = bot_pos.offset(0, -1, 0).xzDistanceTo(b.position);
    return a_dist - b_dist;
  });

  // check
  for(let i = 0; i < arr.length; ++i){
    if(bot_pos.offset(0, -1, 0).equals(arr[i].position)){
      debug(`Floor Block: ${arr[i].position}`);
      if(i != arr.length-1) throw Error("Strange Order !");
    }
  }
}

export async function *digBlocks(bot:mineflayer.Bot, config:digBlocksConfig) {
  // find all blocks nearby
  debug("============ Find Target ============");
  let targets = findBlocks(bot, config.target_blocks, 
    [config.maxDistance, config.maxDistance, config.maxDistance], config.range, true);
  debug(`Find ${targets.length} targets`);
  sortTargetsByAngelandDistance(bot, targets);
  debug(targets.map((b:Block) => b.position));

  // find all blocks far away from me
  if(targets.length == 0){
    debug("============ Find High Target ============");
    let high_targets = findBlocks(bot, config.target_blocks, 
      [48, Math.abs(config.range[1].y-config.range[0].y)+1, 48], 
      config.range, false);
    // sort from nearest to farthest
    high_targets.sort((a:Block, b:Block) => {
      return bot.entity.position.xzDistanceTo(a.position) - bot.entity.position.xzDistanceTo(b.position);
    });
    debug(`High Target Size: ${high_targets.length}`);
    for(let i = 0; i < high_targets.length; ++i){
      if(high_targets[i].position.y >= bot.entity.position.y){
        debug(`Go to X: ${high_targets[i].position.x}, Z: ${high_targets[i].position.z}`);
        const isArrived = await onlyWaitForSpecTime(bot.pathfinder.goto(
          new goals.GoalXZ(high_targets[i].position.x, high_targets[i].position.z)), 15*1000, () => {
            bot.pathfinder.stop();
            debug('Exceed Time Limit, Stop Moving ~');
        });
        if(!isArrived){
          debug('Walk Failed');
          continue;
        }
        debug(`Location: ${bot.entity.position} Arrived`);
        if(config.ctop){
          debug('Use ctop');
          await onlyWaitForSpecTime(new Promise<void>((resolve) => {
            bot.once('forcedMove', () => {
              debug('Move Success');
              resolve();
            });
            bot.chat('/ctop');
          }), 5*1000, null);
          debug(`Location: ${bot.entity.position}`);
          await bot.waitForTicks(5);
          await bot.waitForChunksToLoad();
        }
        return true;
      }
    }
  }
  
  // if there is no block, then walk
  if(targets.length == 0){
    debug("No block can be digged");
    debug("============ Walk ============");
    
    // walk function for walk phase
    async function walk(goal_loc:Vec3, time_limit:number, nearDist:number){
      const isArrived = await onlyWaitForSpecTime(bot.pathfinder.goto(
        new goals.GoalCompositeAny([
          new goals.GoalNear(goal_loc.x, goal_loc.y, goal_loc.z, nearDist),
          new goals.GoalXZ(goal_loc.x, goal_loc.z)
        ]), (err)=>{
          debug(err);
        }), time_limit, () => {
          bot.pathfinder.stop();
          debug('Exceed Time Limit, Stop Moving ~');
      });
      if(!isArrived){
        debug('Walk Failed');
      }else{
        debug("Arrived");
      }
      return isArrived;
    }

    // find blocks with a larger range
    const offset = 16;
    const max_retry_x = Math.floor((Math.abs(config.range[1].x-config.range[0].x+1)-offset) / offset);
    const max_retry_z = Math.floor((Math.abs(config.range[1].z-config.range[0].z+1)-offset) / offset);
    const max_retry = max_retry_x * max_retry_z;
    debug(`Max Retry: ${max_retry}`);

    // find all possible targets
    let targets:Block[] = [];
    let retry = 0;
    while(retry < max_retry){
      debug(`Retry: ${retry}`);
      // check danger & food
      yield true;

      targets = findBlocks(bot, config.target_blocks, 
        [48, Math.abs(config.range[1].y-config.range[0].y)+1, 48], config.range, false);
      if(targets.length > 0) break;

      // if still no target, then walk to fixed location any try again
      const row = Math.floor(retry/max_retry_z);
      const col = retry % max_retry_z;
      const retry_loc = new Vec3(
        config.range[0].x + offset*row + offset/2, 
        config.range[0].y, 
        row % 2 == 0 ? 
          (config.range[0].z + offset*col + offset/2) :
          (config.range[1].z - offset*col - offset/2));
      debug(`Retry Location: ${retry_loc}`);
      await walk(retry_loc, 60*1000, 0);
      await bot.waitForChunksToLoad();
      retry++;
    }

    // check final result
    if(targets.length == 0){
      return false;
    }

    // select closest one
    let closest_target:Block = targets[0];
    for(let i = 1; i < targets.length; ++i){
      if(bot.entity.position.xzDistanceTo(targets[i].position) < 
          bot.entity.position.xzDistanceTo(closest_target.position)){
            closest_target = targets[i];
      }
    }
    const goal_loc = closest_target.position;
    debug(`Location: ${bot.entity.position}`);
    debug(`Set Goal to ${goal_loc}`);

    // walk
    debug("Try to walk");
    await walk(goal_loc, 15*1000, 4.5);
  }else{
    debug("============ Dig ============");
    // dig loop
    for(let i = 0; i < targets.length; i++){
      // check danger & food
      if(i % 10 == 9) yield true;
      // check block state
      if(!bot.canDigBlock(targets[i])) continue;
      // dig
      let tool = targets[i].material.replace('mineable/', '');
      if(tool == 'wool') tool = 'shears';
      debug(`Check ${targets[i].material} to Dig ${targets[i].displayName}`);
      tool = await changeTool(bot, tool, config.durability_percentage_threshold);
      try {
        debug(`Dig Target ${targets[i].displayName} At ${targets[i].position} Use ${tool}`);
        await bot.dig(targets[i]);
        debug(`Dig Done`);
      } catch (err) {
        debug(err); // Handle errors, if any
      }
    }

    // wait for finish falling
    debug("Wait for finish falling");
    await onlyWaitForSpecTime(new Promise<void>(async (resolve) => {
      while(Math.abs(bot.entity.velocity.y) > 0.1){
        debug(`Velocity: ${bot.entity.velocity}`);
        await bot.waitForTicks(20);
      }
      await bot.waitForChunksToLoad();
      resolve();
    }), 10*1000, null);
    await bot.waitForTicks(10);

    // collect
    debug("============ Collect ============");
    let dropped_item:Entity[] = [];
    for(const id in bot.entities){ 
      if(bot.entities[id].objectType == 'Item' &&
        bot.entities[id].position.y <= bot.entity.position.y &&
        inside(config.range[0].offset(-2, 0, -2), config.range[1].offset(2, 0, 2), 
          bot.entities[id].position) &&
        (config.target_blocks.includes(bot.entities[id].getDroppedItem().name) ||
          bot.entities[id].getDroppedItem().name == config.item_container)){ 
        debug(bot.entities[id].getDroppedItem());
        dropped_item.push(bot.entities[id]); 
      }
    }
    debug(`Dropped Item Count: ${dropped_item.length}`);
    dropped_item.sort((a: Entity, b: Entity):number => {
      return bot.entity.position.xzDistanceTo(a.position) - bot.entity.position.xzDistanceTo(b.position);
    });
    let collect_loop = 0;
    while(collect_loop < 15 && dropped_item.length > 0){
      if(bot.inventory.emptySlotCount() < config.inventory_empty_min) break;
      // check danger & food
      if(collect_loop % 5 == 4) yield true;
      const en = dropped_item.shift();
      debug(`Collect ${en.displayName} At ${en.position}`);
      await bot.lookAt(en.position, true);
      const result = await onlyWaitForSpecTime(bot.pathfinder.goto(
        new goals.GoalNear(en.position.x, en.position.y, en.position.z, 0)), 10*1000, () => {
          bot.pathfinder.stop();
          debug('Exceed Time Limit, Stop Moving ~');
      });
      // await bot.waitForTicks(4);
      if(result) debug("Collect Done");
      else debug("Skip Collecting");
      collect_loop++;
    }

    // put items
    debug(`Empty Slot: ${bot.inventory.emptySlotCount()}`);
    if(bot.inventory.emptySlotCount() < config.inventory_empty_min){
      debug("============ Put Items ============");
      debug("Find Box");
      const box = 
        bot.inventory.findInventoryItem(
          bot.registry.itemsByName[config.item_container].id, null, true) ||
        bot.inventory.findInventoryItem(
          bot.registry.itemsByName[config.item_container].id, null, false);
      
      if(box){
        debug(`Box Count: ${box.count}`);
        debug("Equip Box");
        await bot.equip(box, 'hand');
        debug("Find Location");
        const loc_block_candidates = findBlocks(bot, undefined, [config.maxDistance, 2, config.maxDistance],
          [config.range[0].offset(-1,-1,-1), config.range[1].offset(1,1,1)], true);
        let loc_block:Block = undefined, place_result = false;
        debug(`Location Candidate: ${loc_block_candidates.length}`);
        for(let i = 0; i < loc_block_candidates.length; ++i){
          if(loc_block_candidates[i].name != 'air' && 
              bot.blockAt(loc_block_candidates[i].position.offset(0, 1, 0)).name == 'air' &&
              bot.blockAt(loc_block_candidates[i].position.offset(0, 2, 0)).name == 'air' &&
              loc_block_candidates[i].name != bot.registry.itemsByName[config.item_container].name &&
              bot.canSeeBlock(loc_block_candidates[i]) &&
              bot.entity.position.distanceTo(loc_block_candidates[i].position) > 0 &&
              bot.entity.position.distanceTo(loc_block_candidates[i].position) <= 3.5){
            
            loc_block = loc_block_candidates[i];
            place_result = await new Promise<boolean>(async (resolve) => {
              await bot.placeBlock(loc_block, new Vec3(0, 1, 0)).catch((reason:any) => {
                debug(reason);
                resolve(false);
              }).then(() => resolve(true));
            });
            if(place_result) break;
          }
        }
        if(loc_block == undefined) throw new Error("Can't find a place to place the box");
        if(!place_result) throw new Error("Place the box ERROR");
        debug(`Place Box On ${loc_block.displayName} At ${loc_block.position.offset(0, 1, 0)}`);
        
        debug("Place Done");
        const chest = await bot.openChest(bot.blockAt(loc_block.position.offset(0, 1, 0)));
        debug("Chest Opened");
        let deposit_items = [];
        const inventory_items = bot.inventory.items();
        for(let i = 0; i < inventory_items.length; ++i){
          if(!config.store_item_black_list.includes(inventory_items[i].name)){
            deposit_items.push(inventory_items[i]);
          }
        }
        debug(`Deposit Item Size: ${deposit_items.length}`);
        debug("Start Deposit");
        await depositItems(chest, deposit_items);
        debug("Finish Deposit");
        bot.closeWindow(chest);
      }else{
        debug("I Can't find any box !!!");
        throw Error("I Can't find any box !!!");
      }
    }
  }

  await bot.waitForTicks(config.delay);
  return true;
}