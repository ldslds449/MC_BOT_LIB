import mineflayer from 'mineflayer'
import { Entity } from 'prismarine-entity'

const debug = require('debug')('MC_BOT_LIB:attack');

interface attackConfig{
  entity:string[];
  delay:number; // tick
  weapon:string;
  dynamicView:boolean;
};

export async function attackEntity(bot:mineflayer.Bot, config:attackConfig):Promise<boolean> {
  const DISTANCE_THRESHOLD = 6;

  // check weapon
  bot.updateHeldItem();
  if(bot.heldItem == null || bot.heldItem.name != config.weapon){
    const weapon = bot.inventory.findInventoryItem(config.weapon, null, false);
    if(weapon) {
      await bot.equip(weapon, 'hand');
    }
  }

  // find target
  let target:Entity = undefined, target_dist:number = Number.POSITIVE_INFINITY;
  for(const id in bot.entities){
    const en = bot.entities[id];
    // check mod type
    if(!config.entity.includes(en.name)) continue;
    // check distance
    const distance = en.position.distanceTo(bot.entity.position);
    if(distance > DISTANCE_THRESHOLD) continue;
    // find the cloest target
    if(distance < target_dist){
      target_dist = distance;
      target = en;
    }
  }

  // attack
  if(target != undefined){
    debug(`Attack ${target.displayName} At ${target.position} With ${bot.heldItem.displayName}`);
    if(config.dynamicView){
      bot.lookAt(target.position);
    }
    bot.attack(target);
  }
  await bot.waitForTicks(config.delay);
  return target != undefined;
}


