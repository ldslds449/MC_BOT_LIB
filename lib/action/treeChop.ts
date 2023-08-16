import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { Block } from 'prismarine-block'
import { sleep } from '../util/time';

const debug = require('debug')('MC_BOT_LIB:treeChop');

interface treeChopConfig{
  tree:string[];
  delay:number; // tick
  weapon:string;
  maxDistance:number;
  offsetX:number;
  offsetZ:number;
  targetY:number;
};

export async function treeChop(bot:mineflayer.Bot, config:treeChopConfig):Promise<void> {
  // find all trees
  let trees:Vec3[] = [];
  for(let i = 1; i < config.maxDistance; ++i){
    const block = bot.blockAt(
      bot.entity.position.offset(config.offsetX*i, config.targetY, config.offsetZ*i));
    if(config.tree.includes(block.name)){
      trees.push(block.position);
    }
  }
  debug(trees);

  // check the weapon
  bot.updateHeldItem();
  if(bot.heldItem == null || bot.heldItem.name != config.weapon){
    const weapon = bot.inventory.findInventoryItem(bot.registry.itemsByName[config.weapon].id, null, false);
    if(weapon) {
      await bot.equip(weapon, 'hand')
    }
  }
  if(bot.heldItem != null) debug(bot.heldItem.displayName);

  // dig
  for(let i = 0; i < trees.length; i++){
    await bot.dig(bot.blockAt(trees[i]));
    debug(`Dig Target ${trees[i]}`);
    await bot.waitForTicks(config.delay);
  }

  await bot.waitForTicks(config.delay);
}