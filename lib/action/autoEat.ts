import mineflayer from 'mineflayer'

const debug = require('debug')('MC_BOT_LIB:autoEat');

interface eatConfig{
  food:string[];
  threshold:{
    health:number;
    food:number;
  };
  onlyQuickBarSlot:boolean;
  offhand:boolean;
};

export async function autoEat(bot:mineflayer.Bot, config:eatConfig):Promise<void> {
  const EATTIME = 32; // eat time: 32 ticks

  debug(`Health: ${bot.health}`, `Food: ${bot.food}`);

  // eat condition
  if(bot.food != undefined && bot.health != undefined){
    if(bot.food >= 20) return;
    if(bot.food < config.threshold.food && bot.health < config.threshold.health){
      // check held item
      bot.updateHeldItem();
      let isHeld:boolean;
      if(config.offhand){
        const offHandItem = bot.inventory.slots[bot.getEquipmentDestSlot('off-hand')];
        isHeld = offHandItem != null && config.food.includes(offHandItem.name);
        debug(offHandItem.displayName);
      }else{
        isHeld = config.food.includes(bot.heldItem.name);
        debug(bot.heldItem.displayName);
      }
      
      // get the food to hand
      if(!isHeld){
        // find the food
        for(const item of bot.inventory.items()){
          item.slot
          if(config.food.includes(item.name)){
            await bot.equip(item, config.offhand ? 'off-hand' : 'hand');
            debug(item.displayName);
            break;
          }
        }
      }
  
      // eat the food
      bot.activateItem(config.offhand);
      debug('Start Eating');

      let timer:NodeJS.Timeout;
      const timeout_promise = new Promise<void>((_, reject) => {
        timer = setTimeout(() => {
          bot.deactivateItem();
          debug('Cancel Eating');
          reject();
        }, EATTIME * 2 * 50); // 1 tick = 0.05 (s) = 50 (ms)
      });
      return await Promise.race([bot.consume(), timeout_promise])
        .finally(() => {
          clearTimeout(timer);
        });
    }
  }
}