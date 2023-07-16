import mineflayer from 'mineflayer'
import { Entity } from 'prismarine-entity'

const debug = require('debug')('MC_BOT_LIB:attack');

interface attackConfig{
  entity:string[];
  delay:number; // tick
  weapon:string;
  dynamicView:boolean;
};

export async function attackEntity(bot:mineflayer.Bot, config:attackConfig):Promise<void> {
  const DISTANCE_THRESHOLD = 6;

  debug(config);

  // check weapon
  bot.updateHeldItem();
  if(bot.heldItem == null || bot.heldItem.name != config.weapon){
    const weapon = bot.inventory.findInventoryItem(config.weapon, null, false);
    if(weapon) {
      await bot.equip(weapon, 'hand')
    }
  }

  if(bot.heldItem != null) debug(bot.heldItem.displayName);

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
    if(config.dynamicView){
      bot.lookAt(target.position);
    }
    bot.attack(target);
  }
  await bot.waitForTicks(config.delay)
}


