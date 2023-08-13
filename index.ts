import yaml from 'js-yaml';
import fs from 'fs';

import mineflayer from 'mineflayer'
import loader from 'prismarine-registry'
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
const actions:Action[] = cfg.Actions.map((x:string) => Action[x as keyof typeof Action]);
const ip:string = cfg.ip;
const port:number = Number(cfg.port);
const version:string = cfg.version;

// open debug info
if(cfg.showInfo){
  require('debug').enable('MC_BOT_LIB:*');
}

// create tasks
function createTasks():((bot:mineflayer.Bot) => Promise<any>)[]{
  debug(cfg);
  let tasks:((bot:mineflayer.Bot) => Promise<any>)[] = [];
  for(let i = 0; i < actions.length; ++i){
    if(actions[i] == Action.Attack){
      const config:attackConfig = {
        entity: cfg.Attack.enemies,
        delay: cfg.Attack.delay,
        weapon: cfg.Attack.weapon,
        dynamicView: true
      }

      tasks.push(async (bot:mineflayer.Bot) => {
        let attacked:boolean;
        do{
          console.log('> Attack <');
          attacked = await attackEntity(bot, config);
        }while(attacked);  // try to attack again
      });
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

      tasks.push(async (bot:mineflayer.Bot) => {
        let ate:boolean;
        do{
          console.log('> AutoEat <');
          ate = await autoEat(bot, config);
        }while(ate);  // try to eat again
      });
    }else if(actions[i] == Action.DigBlocks){
      let target_blocks:string[] = [];
      const registry = loader(version);
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
      tasks.push(async (bot:mineflayer.Bot) => {
        console.log('> DigBlocks <');
        // set move strategy for bot
        let defaultMove = new Movements(bot);
        defaultMove.maxDropDown = 1024;
        defaultMove.exclusionAreasStep = [(block:SafeBlock):number => {
          return (inside(bottom_corner, upper_corner, block.position)? 0 : 100);
        }];
        defaultMove.exclusionBreak = (block:SafeBlock):number => {
          return (target_blocks.includes(block.name) ? 0 : 100);
        };
        defaultMove.exclusionAreasPlace = [(block:SafeBlock):number => {
          return 100;
        }];
        bot.pathfinder.setMovements(defaultMove);

        const success = await digBlocks(bot, config);
        if(success >= cfg.DigBlocks.maxRetry){
          throw Error('Retry exceeds maximum');
        }else{
          retry = (success ? 0 : retry+1);
        }
      });
    }
  }
  return tasks;
}

async function routine(tasks:((bot:mineflayer.Bot) => Promise<any>)[]){
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
      port: Number(cfg.InventoryViewer.port),
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
        for(let i = 0; i < tasks.length; ++i){
          await tasks[i](bot.instance);
        }
      }
    }catch(err){ console.log(err); };
  }
  
  // set event listener
  bot.instance.once('login', () => {
    console.log("Login Success")
  });
  bot.instance.on("error", (err) => {
    console.error(err);
  });
  bot.instance.once("kicked", (err) => {
    console.error(err);
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

    const checkSender = (regex:RegExp):boolean => {
      if(regex.test(text)){
        const player = text.match(regex)[1];
        debug(`Sender: ${player}`);
        if(cfg.Control.listType == 'white' && cfg.Control.list.includes(player) ||
          cfg.Control.listType == 'black' && !cfg.Control.list.includes(player)){
            return true;
        }
      }
      return false;
    }

    const regex_tpa = new RegExp('(\\w+) 想要傳送到 你 的位置', 'm');
    const regex_tph = new RegExp('(\\w+) 想要你傳送到 該玩家 的位置', 'm');
    if(cfg.Control.Command.TPA && checkSender(regex_tpa) ||
      cfg.Control.Command.TPH && checkSender(regex_tph)){
        debug('Command: TPA/TPH');
        await bot.instance.waitForTicks(30);  // wait 1.5 sec
        bot.instance.chat('/tok');
    }else{
      const regex_cmd = new RegExp(`\\[${cfg.Control.channel}] \\[-] <(\\w+)>`, 'm');
      if(checkSender(regex_cmd)){
        const regex_msg = new RegExp(`\\[${cfg.Control.channel}] \\[-] <\\w+> (.*)`, 'm');
        const content = text.match(regex_msg)[1];
        
        debug(`Content: ${content}`);
        if(cfg.Control.Command.work && content == '//work'){
          debug('Command: Work');
          run_all_tasks();
        }else if(cfg.Control.Command.stop && content == '//stop'){
          debug('Command: Stop');
          keep_running = false;
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

const tasks = createTasks();
routine(tasks);
