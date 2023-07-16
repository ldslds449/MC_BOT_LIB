import yaml from 'js-yaml';
import fs from 'fs';

import { program } from 'commander';
import { BotFactory } from './lib/bot/create';
import { MicrosoftTokenDeviceHelper } from './lib/account/token/microsoft/device';
import { Token } from './lib/account/helper';
import { attackEntity } from './lib/action/attack';
import { sleep } from './lib/util/sleep';

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
  DepositEmerald
}

const client_id:string = cfg.clientID;
const action:Action = Action[cfg.action as keyof typeof Action];
const ip:string = cfg.ip;
const port:number = Number(cfg.port);


async function routine(){
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
  console.log(token.minecraft_token);

  const bot = BotFactory.MCAuth(ip, port, userInfo.name, userInfo.id, token.minecraft_token, 60 * 1000);
  
  bot.instance.once('login', () => {
    console.log("Login Success")
  });
  bot.instance.on("error", (err) => {
    console.error(err);
  });
  bot.instance.once("kicked", (err) => {
    console.error(err);
  });

  bot.instance.once('spawn', async () => {
    console.log("Spawn");
    console.log("Start !!!");
    console.log(`Action: ${cfg.action}`);

    if(action == Action.Attack){
      while(true){
        await attackEntity(bot.instance, {
          entity: [
            "blaze",
            "creeper",
            "drowned",
            "elder_guardian",
            "endermite",
            "evoker",
            "ghast",
            "guardian",
            "hoglin",
            "husk",
            "magma_cube",
            "phantom",
            "piglin_brute",
            "pillager",
            "ravager",
            "shulker",
            "silverfish",
            "skeleton",
            "slime",
            "stray",
            "vex",
            "vindicator",
            "witch",
            "wither_skeleton",
            "zoglin",
            "zombie_villager",
            "enderman",
            "piglin",
            "spider",
            "cave_spider",
            "zombified_piglin",
          ],
          delay: 16,
          weapon: 'diamond_sword',
          dynamicView: true
        });
      }
    }

    bot.close();
  });
}

routine();
