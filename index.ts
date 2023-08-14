import yaml from 'js-yaml';
import fs from 'fs';

import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { program } from 'commander';
import { BotFactory } from './lib/bot/create';
import { MicrosoftTokenDeviceHelper } from './lib/account/token/microsoft/device';
import { Token } from './lib/account/helper';
import { attackEntity, attackConfig } from './lib/action/attack';
import { craft } from './lib/action/autoCraft';
import { treeChop } from './lib/action/treeChop';
import { digBlocks, digBlocksConfig } from './lib/action/digBlocks';
import { autoEat, eatConfig } from './lib/action/autoEat';
import { sleep } from './lib/util/sleep';
import { inside } from './lib/util/inside';

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
function createTasks():{[name:string]:((bot:mineflayer.Bot) => Promise<any>)}{
  debug(cfg);
  let tasks:{[name:string]:((bot:mineflayer.Bot) => Promise<any>)} = {};
  for(let i = 0; i < actions.length; ++i){
    if(actions[i] == Action.Attack){
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
    }else if(actions[i] == Action.AutoEat){
      const config:eatConfig = {
        food: cfg.AutoEat.foods,
        threshold:{
          health: cfg.AutoEat.Threshold.food,
          food: cfg.AutoEat.Threshold.health
        },
        onlyQuickBarSlot: cfg.AutoEat.onlyQuickBarSlot,
        offhand: cfg.AutoEat.offhand
      }

      tasks.AutoEat = async (bot:mineflayer.Bot) => {
        let ate:boolean;
        do{
          ate = await autoEat(bot, config);
        }while(ate);  // try to eat again
      };
    }else if(actions[i] == Action.DigBlocks){
      let target_blocks:string[] = [];
      const registry = require('prismarine-registry')(version);
      for(let i = 0; i < cfg.DigBlocks.target_blocks.length; ++i){
        if((cfg.DigBlocks.target_blocks[i] as string).endsWith('*')){
          const key = (cfg.DigBlocks.target_blocks[i] as string).replace('*', '');
          for(let k = 0; k < registry.itemsArray.length; ++k){
            if(registry.itemsArray[k].name.includes(key)){
              target_blocks.push(registry.itemsArray[k].name);
            }
          }
        }else{
          target_blocks.push(cfg.DigBlocks.target_blocks[i]);
        }
      }

      const bottom_corner = 
        new Vec3(
          Number(cfg.DigBlocks.range[0][0]), 
          Number(cfg.DigBlocks.range[0][1]), 
          Number(cfg.DigBlocks.range[0][2]));
      const upper_corner = 
        new Vec3(
          Number(cfg.DigBlocks.range[1][0]), 
          Number(cfg.DigBlocks.range[1][1]), 
          Number(cfg.DigBlocks.range[1][2]));

      const config:digBlocksConfig = {
        target_blocks: target_blocks,
        delay: Number(cfg.DigBlocks.delay), // tick
        maxDistance: cfg.DigBlocks.maxDistance,
        range: [bottom_corner, upper_corner],
        terminate_entities: cfg.DigBlocks.terminate_entities,
        danger_radius: cfg.DigBlocks.danger_radius,
        inventory_empty_min: cfg.DigBlocks.inventory_empty_min,
        item_container: cfg.DigBlocks.item_container,
        durability_percentage_threshold: cfg.DigBlocks.durability_percentage_threshold
      };
      
      let retry = 0;
      tasks.DigBlocks = async (bot:mineflayer.Bot) => {
        // set move strategy for bot
        let defaultMove = new Movements(bot);
        defaultMove.maxDropDown = 1024;
        defaultMove.exclusionAreasStep = [(block:SafeBlock):number => {
          return (inside(bottom_corner, upper_corner, block.position)? 0 : Number.POSITIVE_INFINITY);
        }];
        defaultMove.exclusionBreak = (block:SafeBlock):number => {
          return (target_blocks.includes(block.name) ? 0 : Number.POSITIVE_INFINITY);
        };
        defaultMove.exclusionAreasPlace = [(block:SafeBlock):number => {
          return Number.POSITIVE_INFINITY;
        }];
        bot.pathfinder.setMovements(defaultMove);

        const success = await digBlocks(bot, config);
        if(success >= cfg.DigBlocks.maxRetry){
          throw Error('Retry exceeds maximum');
        }else{
          retry = (success ? 0 : retry+1);
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
  let keep_running = true;
  async function run_all_tasks(){
    keep_running = true;
    // wait for finishing loading chunks
    await bot.instance.waitForChunksToLoad();
    await sleep(1000);

    // run tasks
    try{
      while(keep_running){
        for(const act in tasks){
          console.log(`> ${act} <`);
          await tasks[act](bot.instance);
        }
      }
    }catch(err){ 
      console.log(err); debug(err); 
    }finally{
      keep_running = false;
    };
  }
  
  // set event listener
  bot.instance.once('login', () => {
    console.log("Login Success")
  });
  bot.instance.on("error", (err) => {
    console.error(err);
  });
  bot.instance.on("kicked", (err) => {
    console.error(err);
  });
  bot.instance.on('death', async () => {
    await bot.instance.waitForTicks(20);
    bot.instance.chat("I'm dead. Back to previous location.");
    bot.instance.chat('/back');
    await run_all_tasks();
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
    if(text.match(regex_wait)){
      debug('Transfered to waiting Room');
      bot.instance.chat('Transfered to waiting Room');
      if(cfg.Action.stopInWaitRoom){
        debug('Stop actions');
        bot.instance.chat('Stop actions');
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
        await run_all_tasks();
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
    if(cfg.Control.Command.TPA && tpa_sender){
      debug('Command: TPA');
      bot.instance.chat(`Repley ${tpa_sender}: TPA OK`);
      await bot.instance.waitForTicks(30);  // wait 1.5 sec
      bot.instance.chat('/tok');
    }else if(cfg.Control.Command.TPH && tph_sender){
      debug('Command: TPH');
      bot.instance.chat(`Repley ${tph_sender}: TPH OK`);
      await bot.instance.waitForTicks(30);  // wait 1.5 sec
      bot.instance.chat('/tok');
    }else{
      const regex_cmd = new RegExp(`\\[${cfg.Control.channel}] \\[-] <(.+)>`, 'm');
      const sender = checkSender(regex_cmd);
      if(sender){
        const regex_msg = new RegExp(`\\[${cfg.Control.channel}] \\[-] <.+> (.*)`, 'm');
        const content = text.match(regex_msg)[1];
        
        debug(`Content: ${content}`);
        if(cfg.Control.Command.work && content == '//work'){
          debug('Command: Work');
          bot.instance.chat(`Repley ${sender}: Work OK`);
          await run_all_tasks();
        }else if(cfg.Control.Command.stop && content == '//stop'){
          debug('Command: Stop');
          bot.instance.chat(`Repley ${sender}: Stop OK`);
          keep_running = false;
        }else if(cfg.Control.Command.location && content == '//location'){
          debug('Command: Location');
          const loc = bot.instance.entity.position;
          bot.instance.chat(`Repley ${sender}: I'm at X: ${Math.round(loc.x)}, Y: ${Math.round(loc.y)}, Z: ${Math.round(loc.z)}`);
        }else if(cfg.Control.Command.state && content == '//state'){
          debug('Command: State');
          bot.instance.chat(`Repley ${sender}: ${keep_running ? "I'm working." : "Do nothing."}`);
        }else if(cfg.Control.Command.listTask && content == '//listTask'){
          debug('Command: List Task');
          let msg_arr:string[] = [];
          for(const act in tasks) msg_arr.push(act);
          bot.instance.chat(`Tasks: ${msg_arr.join(", ")}`);
        }else if(cfg.Control.Command.exec && content.startsWith('//exec ')){
          debug('Command: Execute');
          const cmd = content.replace('//exec ', '')
          bot.instance.chat(`Repley ${sender}: Ok, execute "${cmd}"`);
          bot.instance.chat(cmd);
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

  // Reconnect
  let reconnect_time = 0;
  bot.instance.on('end', () => {
    debug('Disconnect');
    if(cfg.Reconnect.enable && 
      (reconnect_time < cfg.Reconnect.maxLimit || cfg.Reconnect.maxLimit == -1)){
      setTimeout(() => { routine(tasks); }, cfg.Reconnect.delay*1000);
    }
  })

  bot.instance.once('spawn', async () => {
    console.log("Spawn");
    console.log("Start !!!");

    await run_all_tasks();
  });
}

let tasks = createTasks();
routine(tasks);
