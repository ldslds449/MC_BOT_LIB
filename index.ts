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
import { craft } from './lib/action/autoCraft';
import { treeChop } from './lib/action/treeChop';
import { digBlocks, digBlocksConfig } from './lib/action/digBlocks';
import { autoEat, eatConfig } from './lib/action/autoEat';
import { sleep } from './lib/util/time';
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
  bot.instance.on("message", async (jsonMsg, position) => {
    const text = jsonMsg.toString();
    debug(text);

    // check waiting message
    const regex_wait = new RegExp('Summoned to wait by CONSOLE', 'm');
    const regex_back = new RegExp('Summoned to server(\\d+) by CONSOLE', 'm');
    let prev_keep_running:boolean = false;
    if(text.match(regex_wait)){
      debug('Transfered to waiting room');
      bot.instance.chat('Transfered to waiting room');
      if(cfg.Action.stopInWaitRoom){
        debug('Stop actions');
        bot.instance.chat('Stop actions');
        prev_keep_running = keep_running;
        keep_running = false;
      }
      return;
    }else if(text.match(regex_back)){
      const channel = text.match(regex_back)[1];
      debug(`Transfered to channel ${channel}`);
      bot.instance.chat(`Transfered to channel ${channel}`);
      if(cfg.Action.autoWorkAfterWait){
        debug('Start actions');
        bot.instance.chat('Start actions');
        if(prev_keep_running) await run_all_tasks();
      }
      return;
    }
    
    const checkSender = (regex:RegExp):string => {
      if(regex.test(text)){
        const player = text.match(regex)[1];
        debug(`Sender: ${player}`);
        if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
          cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
            return player;
        }
      }
      return null;
    }

    const regex_tpa = new RegExp('[系統] (.+) 想要傳送到 你 的位置', 'm');
    const regex_tph = new RegExp('[系統] (.+) 想要你傳送到 該玩家 的位置', 'm');
    const tpa_sender = checkSender(regex_tpa);
    const tph_sender = checkSender(regex_tph);
    if((cfg.Control.Command.TPA && tpa_sender) || (cfg.Control.Command.TPH && tph_sender)){
      if(cfg.Control.Command.TPA){
        debug('Command: TPA');
        bot.instance.chat(`Repley ${tpa_sender}: TPA OK`);
      }else{
        debug('Command: TPH');
        bot.instance.chat(`Repley ${tph_sender}: TPH OK`);
      }

      let waitResp:any;
      const success = await onlyWaitForSpecTime(
        new Promise<void>((resolve) => {
          waitResp = function (jsonMsg){
            const tp_resp = jsonMsg.toString() as string;
            if(tp_resp.includes('接受') && tp_resp.includes('拒絕')){
              bot.instance.chat('/tok');
              resolve();
            }
          }
          bot.instance.on("message", waitResp);
        }).finally(() => {
          bot.instance.off("message", waitResp);
        }), 
        5*1000, null);

      if(cfg.Control.Command.TPA){
        const resp_str = `TPA ${success ? "Successfully" : "Failed"}`;
        debug(resp_str);
        bot.instance.chat(`Repley ${tpa_sender}: ${resp_str}`);
      }else{
        const resp_str = `TPH ${success ? "Successfully" : "Failed"}`;
        debug(resp_str);
        bot.instance.chat(`Repley ${tpa_sender}: ${resp_str}`);
      }
    }else if(text.includes('使用 /back 返回死亡位置')){
      prev_keep_running = keep_running;
      keep_running = false;
      await bot.instance.waitForTicks(60);
      bot.instance.chat("I'm dead. Back to previous location.");
      while(running) await bot.instance.waitForTicks(10);
      if(cfg.Action.backAfterDead) bot.instance.chat('/back');
      if(cfg.Action.autoWorkAfterDead && prev_keep_running) await run_all_tasks();
    }else{
      const regex_cmd = new RegExp(`\\[${cfg.Control.channel}] \\[-] <(.+)>`, 'm');
      const sender = checkSender(regex_cmd);
      if(sender){
        const regex_msg = new RegExp(`\\[${cfg.Control.channel}] \\[-] <.+> (.*)`, 'm');
        const content = text.match(regex_msg)[1];
        
        debug(`Content: ${content}`);
        if(cfg.Control.Command.work && content == '//work'){
          debug('Command: Work');
          debug(`keep_running: ${keep_running}`);
          debug(`running: ${running}`);
          if(keep_running){
            bot.instance.chat(`Repley ${sender}: I'm already working. To stop, please use stop command`);
          }else{
            bot.instance.chat(`Repley ${sender}: Work OK`);
            await run_all_tasks();
          }
        }else if(cfg.Control.Command.stop && content == '//stop'){
          debug('Command: Stop');
          keep_running = false;
          bot.instance.chat(`Repley ${sender}: Stop OK`);
        }else if(cfg.Control.Command.state && content == '//state'){
          debug('Command: State');

          // all state
          const state_str = running ? "Working" : "Do nothing";
          const loc = bot.instance.entity.position;
          const loc_str = `(X: ${Math.round(loc.x)}, Y: ${Math.round(loc.y)}, Z: ${Math.round(loc.z)})`;
          const health_str = `${Math.floor(bot.instance.health)}`;
          const food_str = `${Math.floor(bot.instance.food)}`;
          const saturation_str = `${Math.floor(bot.instance.foodSaturation)}`;
          const exp_str = `(LV ${bot.instance.experience.points}, ${Math.floor(bot.instance.experience.progress*100)}%)`;

          bot.instance.chat(`Repley ${sender}: State: ${state_str}, Location: ${loc_str}, Health: ${health_str}, Hunger: ${food_str}, Saturation:${saturation_str}, Exp: ${exp_str}`);
        }else if(cfg.Control.Command.listAction && content == '//listAction'){
          debug('Command: List Action');
          let msg_arr:string[] = [];
          for(const act in tasks) msg_arr.push(act);
          bot.instance.chat(`Actions: ${msg_arr.join(", ")}`);
        }else if(cfg.Control.Command.addAction && content.startsWith('//addAction ')){
          debug('Command: Add Action');
          debug(`keep_running: ${keep_running}`);
          debug(`running: ${running}`);
          if(keep_running){
            bot.instance.chat(`Repley ${sender}: Please stop working first.`);
            return;
          }
          const action_name = content.replace('//addAction ', '');
          debug(`Action Name: ${action_name}`);
          if(action_name in tasks){
            bot.instance.chat(`Repley ${sender}: ${action_name} is already in the Action list.`);
            return;
          }
          const new_action = Action[action_name as keyof typeof Action];
          if(!new_action){
            bot.instance.chat(`Repley ${sender}: Unknown action: ${action_name}`);
            return;
          }
          debug(`Add Task: ${action_name}`);
          const new_task = createTasks([new_action]);
          tasks[action_name] = new_task[0];
          bot.instance.chat(`Repley ${sender}: ${action_name} Added, you must work manually.`);
        }else if(cfg.Control.Command.exec && content.startsWith('//exec ')){
          debug('Command: Execute');
          const cmd = content.replace('//exec ', '');
          bot.instance.chat(`Repley ${sender}: Ok, execute "${cmd}"`);
          bot.instance.chat(cmd);
        }else if(cfg.Control.Command.draw && content == '//draw'){
          debug('Command: Draw');
          bot.instance.chat(`Repley ${sender}: Ok, Draw`);
          await draw(bot.instance);
        }else if(cfg.Control.Command.csafe && content == '//csafe'){
          debug('Command: csafe');
          bot.instance.chat(`Repley ${sender}: csafe OK`);

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
          bot.instance.chat(`Repley ${sender}: csafe ${success ? "Successfully" : "Failed"}`);
        }else if(content == '//help'){
          debug('Command: Help');
          let msg_arr:string[] = [];
          for(const cmd in cfg.Control.Command){
            if(cfg.Control.Command[cmd]) msg_arr.push(cmd.toString());
          }
          bot.instance.chat(`Commands: ${msg_arr.join(", ")}`);
        }
      }
    }
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
    console.log("Spawn");
    console.log("Start !!!");

    // wait for finishing loading chunks
    await bot.instance.waitForChunksToLoad();
    await sleep(1000);
    await run_all_tasks();
  });
}

let tasks = createTasks(actions);
routine(tasks);
