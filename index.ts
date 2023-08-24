import yaml from 'js-yaml';
import fs from 'fs';

import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { Entity } from 'prismarine-entity'
import { program } from 'commander';
import { BotFactory } from './lib/bot/create';
import { MicrosoftTokenDeviceHelper } from './lib/account/token/microsoft/device';
import { Token } from './lib/account/helper';
import { attackEntity, attackConfig } from './lib/action/attack';
// import { craft } from './lib/action/autoCraft';
// import { treeChop } from './lib/action/treeChop';
import { digBlocks, digBlocksConfig } from './lib/action/digBlocks';
import { autoEat, eatConfig } from './lib/action/autoEat';
// import { sleep } from './lib/util/time';
import { inside } from './lib/util/inside';
import { draw } from './lib/viewer/draw';
import { onlyWaitForSpecTime } from './lib/util/time';

import { pathfinder, SafeBlock } from 'mineflayer-pathfinder'
import { Movements } from 'mineflayer-pathfinder'
import inventoryViewer from 'mineflayer-web-inventory'

const debug = require('debug')('MC_BOT_LIB:main');

program
  .name('mc-tedious-bot')
  .description('A Minecraft bot doing tedious things')
  .version('1.0.0');

program.option('-c, --config <path>', 'path of the config file', 'config.yaml');
program.option('-t, --token <path>', 'path of the token file', 'token.json');
program.parse();

const options = program.opts();

// load config file
let cfg = undefined;
try {
  cfg = yaml.load(fs.readFileSync(options.config, 'utf8'));
} catch (e) {
  console.log(e);
  process.exit();
}

// load token file
let token_cache:Token = undefined;
if(fs.existsSync(options.token)){
  try {
    token_cache = JSON.parse(fs.readFileSync(options.token, 'utf8'));
  } catch (e) {
    console.log(e);
    process.exit();
  }
}

enum Action{
  Attack,
  AutoEat,
  DepositEmerald,  // not yet
  AutoCraft,       // not yet
  TreeChop,        // not yet
  DigBlocks
}

const client_id:string = cfg.clientID;
const actions:Action[] = cfg.Action.actions.map((x:string) => Action[x as keyof typeof Action]);
const ip:string = cfg.ip;
const port:number = Number(cfg.port);
const version:string = cfg.version;

// open debug info
if(cfg.showInfo){
  require('debug').enable('MC_BOT_LIB:*');
}

// create tasks
function createTasks(act:Action[]):{[name:string]:((bot:mineflayer.Bot) => Promise<any>)}{
  debug(cfg);
  let tasks:{[name:string]:((bot:mineflayer.Bot) => Promise<any>)} = {};
  for(let i = 0; i < act.length; ++i){
    if(act[i] == Action.Attack){
      const config:attackConfig = {
        entity: cfg.Attack.enemies,
        delay: cfg.Attack.delay,
        weapon: cfg.Attack.weapon,
        dynamicView: true
      }

      tasks.Attack = async (bot:mineflayer.Bot) => {
        let attacked:boolean;
        do{
          attacked = await attackEntity(bot, config);
        }while(attacked);  // try to attack again
      };
    }else if(act[i] == Action.AutoEat){
      const config:eatConfig = {
        food: cfg.AutoEat.foods,
        threshold:{
          health: cfg.AutoEat.Threshold.health,
          food: cfg.AutoEat.Threshold.food
        },
        onlyQuickBarSlot: cfg.AutoEat.onlyQuickBarSlot,
        offhand: cfg.AutoEat.offhand
      }

      tasks.AutoEat = async (bot:mineflayer.Bot) => {
        let ate:boolean;
        let ate_time = 0;
        do{
          ate = await autoEat(bot, config);
          if(ate) ate_time++;
          else ate_time = 0;
        }while(ate && ate_time <= 5);  // try to eat again
      };
    }else if(act[i] == Action.DigBlocks){
      const registry = require('prismarine-registry')(version);
      const parse_item = function (arr:string[]):string[]{
        let target:string[] = [];
        for(let i = 0; i < arr.length; ++i){
          if((arr[i] as string).endsWith('*')){
            const key = (arr[i] as string).replace('*', '');
            for(let k = 0; k < registry.itemsArray.length; ++k){
              if(registry.itemsArray[k].name.includes(key)){
                target.push(registry.itemsArray[k].name);
              }
            }
          }else{
            target.push(arr[i]);
          }
        }
        return target;
      }
      const target_blocks = parse_item(cfg.DigBlocks.target_blocks);
      const store_item_black_list = parse_item(cfg.DigBlocks.store_item_black_list);

      const bottom_corner = 
        new Vec3(
          Number(Math.min(cfg.DigBlocks.range[0][0], cfg.DigBlocks.range[1][0])), 
          Number(Math.min(cfg.DigBlocks.range[0][1], cfg.DigBlocks.range[1][1])), 
          Number(Math.min(cfg.DigBlocks.range[0][2], cfg.DigBlocks.range[1][2])));
      const upper_corner = 
        new Vec3(
          Number(Math.max(cfg.DigBlocks.range[0][0], cfg.DigBlocks.range[1][0])), 
          Number(Math.max(cfg.DigBlocks.range[0][1], cfg.DigBlocks.range[1][1])), 
          Number(Math.max(cfg.DigBlocks.range[0][2], cfg.DigBlocks.range[1][2])));

      const config:digBlocksConfig = {
        target_blocks: target_blocks,
        delay: Number(cfg.DigBlocks.delay), // tick
        maxDistance: cfg.DigBlocks.maxDistance,
        range: [bottom_corner.clone(), upper_corner.clone()],
        inventory_empty_min: cfg.DigBlocks.inventory_empty_min,
        item_container: cfg.DigBlocks.item_container,
        durability_percentage_threshold: cfg.DigBlocks.durability_percentage_threshold,
        ctop: cfg.DigBlocks.ctop,
        store_item_black_list: store_item_black_list
      };
      
      let progressive_y:number = upper_corner.y;
      let asyncGen:AsyncGenerator<boolean, boolean, unknown> = undefined;
      tasks.DigBlocks = async (bot:mineflayer.Bot) => {
        // set move strategy for bot
        let defaultMove = new Movements(bot);
        defaultMove.maxDropDown = 1024;
        defaultMove.exclusionAreasStep = [(block:SafeBlock):number => {
          if(cfg.DigBlocks.moveInRange && block && block.position){
            return (inside(bottom_corner.offset(-2, 0, -2), upper_corner.offset(2, 0, 2), block.position) ? 0 : 100);
          }else{
            return 0;
          }
        }];
        defaultMove.exclusionBreak = (block:SafeBlock):number => {
          return (target_blocks.includes(block.name) ? 0 : Number.POSITIVE_INFINITY);
        };
        defaultMove.exclusionAreasPlace = [(block:SafeBlock):number => {
          return Number.POSITIVE_INFINITY;
        }];
        bot.pathfinder.setMovements(defaultMove);

        // set y
        if(cfg.DigBlocks.progressive){
          debug(`Progressive Y: ${progressive_y}`);
          config.range[0].y = progressive_y;
        }
        
        if(asyncGen == undefined){
          asyncGen = digBlocks(bot, config);
        }
        const success = await asyncGen.next().then((r) => { return r.value; });
        debug(`Success ${success}`);
        if(success == undefined){
          asyncGen = digBlocks(bot, config);
        }else{
          if(!success){
            if(cfg.DigBlocks.progressive && progressive_y > bottom_corner.y){
              progressive_y--;
              debug(`Decrease Y from ${progressive_y+1} to ${progressive_y}`);
              return;
            }
            // bot.chat("I can't find any target, so I quit.");
            debug("I can't find any target, so I quit.");
            // @ts-ignore
            bot.emit('finish', 'No target, Bye ~~');
          }
        }
        
      };
    }
  }
  return tasks;
}

async function routine(tasks:{[name:string]:((bot:mineflayer.Bot) => Promise<any>)}){
  const helper:MicrosoftTokenDeviceHelper = new MicrosoftTokenDeviceHelper(client_id);

  let token:Token = undefined;
  if(token_cache == undefined){  // never login before
    // get auth code
    let auth_code = await helper.getAuthCode();
    console.log(`Please open this link in browser: ${helper.MicrosoftDeviceAuthURL}, Code: ${auth_code.user_code}`);
    // get token
    token = await helper.getToken();
    // store refresh token
    fs.writeFileSync(options.token, JSON.stringify(token)); 
  }else{  // check whether the token is valid
    const valid = await MicrosoftTokenDeviceHelper.isAccountValid(token_cache.minecraft_token);
    if(!valid){  // refresh token
      token = await helper.refresh(token_cache.refresh_token);
      // store refresh token
      fs.writeFileSync(options.token, JSON.stringify(token)); 
    }else{
      token = token_cache;
    }
  }
  // get username and uuid
  const userInfo = await helper.getUserInfo(token.minecraft_token);
  console.log(`Login: ${userInfo.name}, ${userInfo.id}`);

  // create bot
  let bot = BotFactory.MCAuth(ip, port, userInfo.name, userInfo.id, token.minecraft_token, 60 * 1000, version);

  // install plugin
  if(cfg.InventoryViewer.enable){
    inventoryViewer(bot.instance, {
      ip: '0.0.0.0',
      port: Number(cfg.InventoryViewer.port)
    });
  }
  bot.instance.loadPlugin(pathfinder);

  // run_all_tasks
  let keep_running = true, running = false;
  async function run_all_tasks(){
    keep_running = true;

    // run tasks
    try{
      while(keep_running){
        running = true;
        for(const act in tasks){
          if(!keep_running) break;
          console.log(`> ${act} <`);
          await tasks[act](bot.instance);
        }
      }
    }catch(err){ 
      console.log(err); debug(err); 
    }finally{
      keep_running = false;
      running = false;
    };
  }
  
  // set event listener
  bot.instance.once('login', () => {
    console.log("Login Success")
  });
  bot.instance.on("error", (err) => {
    console.error(err);
    bot.instance.end(err.toString());
  });
  bot.instance.on("kicked", (err) => {
    console.error(err);
  });
  bot.instance.on('death', () => {
    debug('Death');
  });
  bot.instance.on('health', () => {
    debug(`Change: Health ${bot.instance.health}, Food ${bot.instance.food}`);
  });
  bot.instance.on('entityDead', (entity:Entity) => {
    debug(`Entity ${entity.type === 'player' ? entity.username : entity.displayName} dead.`);
  });
  bot.instance.on('entityHurt', (entity:Entity) => {
    debug(`Entity ${entity.type === 'player' ? entity.username : entity.displayName} hurt.`);
  });
  bot.instance.on('playerCollect', (collector, collected) => {
    if (collector.type === 'player' && collected != undefined && collected.objectType == 'Item' &&
      collector.uuid == bot.instance.entity.uuid) {
      const item = collected.getDroppedItem();
      if(item) debug(`Collected ${item.count} ${item.displayName}`);
    }
  });
  // ================== Chat Pattern ================== //
  let prev_keep_running:boolean = false;
  // @ts-ignore
  bot.instance.on('chat:summon_to_waiting_room', (matches) => {
    debug('Transfered to waiting room');
    bot.instance.chat('Transfered to waiting room');
    if(cfg.Action.stopInWaitRoom){
      debug('Stop actions');
      prev_keep_running = keep_running;
      keep_running = false;
      bot.instance.chat('Stop actions');
    }
  });
  // @ts-ignore
  bot.instance.on('chat:summon_to_channel', async (matches) => {
    const channel = matches[0][0];
    debug(`Transfered to channel ${channel}`);
    bot.instance.chat(`Transfered to channel ${channel}`);
    if(cfg.Action.autoWorkAfterWait){
      if(prev_keep_running){
        debug('Start actions');
        bot.instance.chat('Start actions');
        await run_all_tasks();
      }
    }
  });
  // @ts-ignore
  bot.instance.on('chat:tpa', (matches) => {
    const player = matches[0][0];
    debug(`Command: TPA by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        // start to reply ok
        bot.instance.chat(`Repley ${player}: TPA OK`);
        const success = onlyWaitForSpecTime(new Promise<void>((resolve) => {
          bot.instance.once('forcedMove', () => resolve());
          bot.instance.chat('/tok');
        }), 10*1000, null);
        if(success){
          bot.instance.chat('TPA successfully.');
        } else bot.instance.chat('TPA failed.');
    }
  });
  // @ts-ignore
  bot.instance.on('chat:tph', (matches) => {
    const player = matches[0][0];
    debug(`Command: TPH by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        // start to reply ok
        bot.instance.chat(`Repley ${player}: TPH OK`);
        const success = onlyWaitForSpecTime(new Promise<void>((resolve) => {
          bot.instance.once('forcedMove', () => resolve());
          bot.instance.chat('/tok');
        }), 10*1000, null);
        if(success){
          bot.instance.chat('TPH successfully.');
        } else bot.instance.chat('TPH failed.');
    }
  });
  // @ts-ignore
  bot.instance.on('chat:death_back', async (matches) => {
    debug('Death QAQ');
    debug(`Keep Runnung ${keep_running}`);
    debug(`Runnung ${running}`);
    prev_keep_running = keep_running;
    keep_running = false;
    // wait for stop
    while(running){
      debug('Wait for stop...');
      await bot.instance.waitForTicks(10);
    }
    debug(`backAfterDead: ${cfg.Action.backAfterDead}`);
    if(cfg.Action.backAfterDead){
      bot.instance.chat("I'm dead. Back to previous location.");
      const success = onlyWaitForSpecTime(new Promise<void>((resolve) => {
        bot.instance.once('forcedMove', () => resolve());
        bot.instance.chat('/back');
      }), 10*1000, null);
      if(success){
        bot.instance.chat('Back successfully.');
        debug(`autoWorkAfterDead: ${cfg.Action.autoWorkAfterDead}`);
        debug(`prev_keep_running: ${prev_keep_running}`);
        if(cfg.Action.autoWorkAfterDead && prev_keep_running){
          bot.instance.chat('Start working.');
          await run_all_tasks();
        }
      } else bot.instance.chat('Back failed.');
    }else{
      bot.instance.chat("I'm dead.");
    }
  });
  // @ts-ignore
  bot.instance.on('chat:work', async (matches) => {
    const player = matches[0][0];
    debug(`Command: Work by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        debug(`keep_running: ${keep_running}`);
        debug(`running: ${running}`);
        if(keep_running){
          bot.instance.chat(`Repley ${player}: I'm already working. To stop, please use stop command`);
        }else{
          bot.instance.chat(`Repley ${player}: Work OK`);
          if(running){
            // wait for stop
            while(running){
              debug('Wait for stop...');
              await bot.instance.waitForTicks(10);
            }
          }
          bot.instance.chat(`Work successfully.`);
          await run_all_tasks();
        }
    }
  });
  // @ts-ignore
  bot.instance.on('chat:stop', async (matches) => {
    const player = matches[0][0];
    debug(`Command: Stop by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        debug(`keep_running: ${keep_running}`);
        debug(`running: ${running}`);
        keep_running = false;
        bot.instance.chat(`Repley ${player}: Stop OK`);
        // wait for stop
        while(running){
          debug('Wait for stop...');
          await bot.instance.waitForTicks(10);
        }
        bot.instance.chat(`Stop successfully.`);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:state', (matches) => {
    const player = matches[0][0];
    debug(`Command: State by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        // all state
        const state_str = running ? "Working" : "Do nothing";
        const loc = bot.instance.entity.position;
        const loc_str = `(X: ${Math.round(loc.x)}, Y: ${Math.round(loc.y)}, Z: ${Math.round(loc.z)})`;
        const health_str = `${Math.floor(bot.instance.health)}`;
        const food_str = `${Math.floor(bot.instance.food)}`;
        const saturation_str = `${Math.floor(bot.instance.foodSaturation)}`;
        const exp_str = `(LV ${bot.instance.experience.points}, ${Math.floor(bot.instance.experience.progress*100)}%)`;

        bot.instance.chat(`Repley ${player}: State: ${state_str}, Location: ${loc_str}, Health: ${health_str}, Hunger: ${food_str}, Saturation:${saturation_str}, Exp: ${exp_str}`);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:listAction', (matches) => {
    const player = matches[0][0];
    debug(`Command: List Action by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        let msg_arr:string[] = [];
        for(const act in tasks) msg_arr.push(act);
        bot.instance.chat(`Actions: ${msg_arr.join(", ")}`);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:addAction ', (matches) => {
    const player = matches[0][0];
    const action_name = matches[0][1];
    debug(`Command: Add Action ${action_name} by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        debug(`keep_running: ${keep_running}`);
        debug(`running: ${running}`);
        if(keep_running){
          bot.instance.chat(`Repley ${player}: Please stop working first.`);
          return;
        }
        if(action_name in tasks){
          bot.instance.chat(`Repley ${player}: ${action_name} is already in the Action list.`);
          return;
        }
        const new_action = Action[action_name as keyof typeof Action];
        if(!new_action){
          bot.instance.chat(`Repley ${player}: Unknown action: ${action_name}`);
          return;
        }
        debug(`Add Task: ${action_name}`);
        const new_task = createTasks([new_action]);
        tasks[action_name] = new_task[0];
        bot.instance.chat(`Repley ${player}: ${action_name} Added, you must work manually.`);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:exec ', (matches) => {
    const player = matches[0][0];
    const cmd = matches[0][1];
    debug(`Command: Execute ${cmd} by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        bot.instance.chat(`Repley ${player}: Ok, execute "${cmd}"`);
        bot.instance.chat(cmd);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:draw', async (matches) => {
    const player = matches[0][0];
    debug(`Command: Draw by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        bot.instance.chat(`Repley ${player}: Ok, Draw`);
        await draw(bot.instance);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:csafe', async (matches) => {
    const player = matches[0][0];
    debug(`Command: Csafe by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        bot.instance.chat(`Repley ${player}: csafe OK`);

        let waitResp:any;
        const success = await onlyWaitForSpecTime(
          new Promise<void>((resolve) => {
            waitResp = function (jsonMsg){
              const csafe_resp = jsonMsg.toString() as string;
              if(csafe_resp.includes('這個領地內的區域')){
                if(csafe_resp.includes('不會')){
                  resolve();
                }else{
                  bot.instance.chat('/csafe');
                }
              }
            }
            // bot.instance.awaitMessage();
            bot.instance.on("message", waitResp);
            bot.instance.chat('/csafe');
          }).finally(() => {
            bot.instance.off("message", waitResp);
          }), 
          5*1000, null);
        bot.instance.chat(`Repley ${player}: csafe ${success ? "Successfully" : "Failed"}`);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:exit', (matches) => {
    const player = matches[0][0];
    debug(`Command: Exit by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        bot.instance.chat(`Repley ${player}: Exit OK, Bye ~~`);
        // @ts-ignore
        bot.instance.emit('finish', `Exit by ${player}`);
    }
  });
  // @ts-ignore
  bot.instance.on('chat:help', (matches) => {
    const player = matches[0][0];
    debug(`Command: Help by ${player}`);
    if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
      cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
        let msg_arr:string[] = [];
        for(const cmd in cfg.Control.Command){
          if(cfg.Control.Command[cmd]) msg_arr.push(cmd.toString());
        }
        bot.instance.chat(`Commands: ${msg_arr.join(", ")}`);
    }
  });
  
  bot.instance.on("message", async (jsonMsg, _) => {
    const text = jsonMsg.toString();
    debug(`Message: ${text}`);
  });

  let isFinish = false;
  // @ts-ignore
  bot.instance.on('finish', (reason:string) => {
    debug(reason);
    isFinish = true;
    bot.instance.end(reason);
  });

  // Reconnect
  let reconnect_time = 0;
  bot.instance.on('end', () => {
    debug('Disconnect');
    if(!isFinish && cfg.Reconnect.enable && 
      (reconnect_time < cfg.Reconnect.maxLimit || cfg.Reconnect.maxLimit == -1)){
      setTimeout(() => { routine(tasks); }, cfg.Reconnect.delay*1000);
    }
  })

  bot.instance.once('spawn', async () => {
    await bot.instance.awaitMessage('[系統] 讀取人物成功。');

    bot.instance.addChatPattern('summon_to_waiting_room', /Summoned to wait by CONSOLE/m, { parse: false, repeat: true });
    bot.instance.addChatPattern('summon_to_channel', /Summoned to server(\\d+) by CONSOLE/m, { parse: true, repeat: true });
    bot.instance.addChatPatternSet('tpa', [/\[系統] (.+) 想要傳送到 你 的位置/m, / 可點擊按鈕 --> \[接受] \[拒絕]/m], { parse: true, repeat: true });
    bot.instance.addChatPatternSet('tph', [/\[系統] (.+) 想要你傳送到 該玩家 的位置/m, / 可點擊按鈕 --> \[接受] \[拒絕]/m], { parse: true, repeat: true });
    bot.instance.addChatPattern('death_back', /使用 \/back 返回死亡位置。/, { parse: false, repeat: true });
    
    const cmds = ['work', 'stop', 'state', 'listAction', 'addAction ', 'exec ', 'draw', 'csafe', 'exit', 'help'];
    for(let cmd of cmds){
      if(!cfg.Control.Command[cmd]) continue;
      bot.instance.addChatPattern(cmd, new RegExp(`\\[${cfg.Control.channel}] \\[-] <(.+)> \\/\\/${cmd}([\\w\\d\\s\\/]*)$`, 'm'), { parse: true, repeat: true });
    }

    console.log("Spawn");
    console.log("Start !!!");

    // wait for finishing loading chunks
    await bot.instance.waitForChunksToLoad();
    await bot.instance.waitForTicks(20);
    await run_all_tasks();
  });
}

let tasks = createTasks(actions);
routine(tasks);
