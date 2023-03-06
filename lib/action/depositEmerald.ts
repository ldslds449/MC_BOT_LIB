import mineflayer from 'mineflayer'
import { Window } from 'prismarine-windows'
import { sleep } from '../util/sleep';

const debug = require('debug')('MC_BOT_LIB:depositEmerald');

function countItem(bot:mineflayer.Bot, itemName:string):number {
  let count = 0;
  const items = bot.inventory.items();
  debug(`Inventory Item Count: ${items.length}`);
  for(let i = 0; i < items.length; ++i){
    // debug(`Item: ${items[i].name} x ${items[i].count}`);
    if(items[i].name == itemName){
      count += items[i].count;
    }
  }
  return count;
}

export async function depositEmerald(bot:mineflayer.Bot):Promise<void> {
  // find the chest within 6 blocks
  const box_ids = [
    bot.registry.blocksByName['shulker_box'].id,
    bot.registry.blocksByName['red_shulker_box'].id,
    bot.registry.blocksByName['lime_shulker_box'].id,
    bot.registry.blocksByName['pink_shulker_box'].id,
    bot.registry.blocksByName['gray_shulker_box'].id,
    bot.registry.blocksByName['cyan_shulker_box'].id,
    bot.registry.blocksByName['blue_shulker_box'].id,
    bot.registry.blocksByName['white_shulker_box'].id,
    bot.registry.blocksByName['brown_shulker_box'].id,
    bot.registry.blocksByName['green_shulker_box'].id,
    bot.registry.blocksByName['black_shulker_box'].id,
    bot.registry.blocksByName['orange_shulker_box'].id,
    bot.registry.blocksByName['yellow_shulker_box'].id,
    bot.registry.blocksByName['purple_shulker_box'].id,
    bot.registry.blocksByName['magenta_shulker_box'].id,
    bot.registry.blocksByName['light_blue_shulker_box'].id,
    bot.registry.blocksByName['light_gray_shulker_box'].id,
  ];
  const blocksPoints = bot.findBlocks({ matching: box_ids, maxDistance: 6, count: 6*6*6 });
  
  debug(`Target Block Count: ${blocksPoints.length}`);

  for(let i = 0; i < blocksPoints.length; ++i){
    const block = bot.blockAt(blocksPoints[i]);
    const chest = await bot.openContainer(block);

    debug(`Position: ${blocksPoints[i].toString()}`);
    
    const items = chest.containerItems();
    debug(`Chest Item Count: ${items.length}`);

    // check the content of the chest
    let allEmerald = true;
    for(let k = 0; k < items.length; ++k){
      // debug(`Item: ${items[k].name} x ${items[k].count}`);
      if(items[k].name != 'emerald'){
        allEmerald = false;
        break;
      }
    }
    debug(`All Emerald: ${allEmerald}`);
    if(!allEmerald) continue;

    // withdraw all emerald
    for(let k = 0; k < items.length; ++k){
      const item = items[k];
      try {
        await chest.withdraw(item.type, null, item.count);
        debug(`Chest Item Count: ${chest.containerItems().length}`);
      } catch (err) {
        debug(`Unable to withdraw ${item.count} ${item.name}`);
        break;
      }
    }
    await sleep(1500); // wait for shulker box unloader

    // close chest
    if(bot.currentWindow){
      chest.close();
    }
    debug(`Current Window: ${bot.currentWindow ? bot.currentWindow.title : 'NULL'}`);
    
    // get emerald count
    let emeraldCount = countItem(bot, 'emerald');
    debug(`Inventory Item Count (Before): ${emeraldCount}`);

    bot.chat('/bank'); // open bank window
    const bank:Window = await new Promise((resolve) => { // wait for bank window
      bot.once('windowOpen', async (window) => {
        await sleep(1000); // wait for window
        resolve(window);
      });
    });
    debug(`Window: ${bank.title}`);
    
    // despoit all emerald to the bank (only in mcfallout.net server)
    const slotID = [30, 29, 28, 27];
    const despoitCount = [1728, 64, 8, 1];

    while(emeraldCount > 0){
      for(let k = 0; k < slotID.length; ++k){
        if(emeraldCount >= despoitCount[k]){
          await bot.simpleClick.leftMouse(slotID[k]);
          emeraldCount = countItem(bot, 'emerald');
          break;
        }
      }
      await sleep(300); // delay
    }
    bot.closeWindow(bank);

    debug(`Inventory Item Count (After): ${countItem(bot, 'emerald')}`);

    break;
  }
}