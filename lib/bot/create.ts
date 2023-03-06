import mineflayer from 'mineflayer'

const debug = require('debug')('MC_BOT_LIB:bot');

type BotAction = (bot:mineflayer.Bot) => Promise<void>;

export class Bot{
  instance:mineflayer.Bot;
  actions:Map<string, BotAction>;

  constructor(){
    this.actions = new Map();
  }

  addAction(name:string, action:BotAction):void {
    this.actions.set(name, action);
  }

  removeAction(name:string):void {
    this.actions.delete(name);
  }

  async run():Promise<void> {
    while(true){
      for(let [name, action] of this.actions){
        debug(name);
        await action(this.instance);
      }
    }
  }
  
  close(reason?:string):void {
    try{
      this.instance.quit(reason);
      this.instance.end(reason);
    }catch(err){
      console.error(err);
    }
  }
};

export class BotFactory{
  static MCAuth(ip:string, port:number, username:string, uuid:string, minecraftToken:string, checkTimeoutInterval:number = 30000):Bot {
    const config:mineflayer.BotOptions = {
      host: ip,
      port: port,
      username: username,
      session: {
        accessToken: minecraftToken,
        selectedProfile: {
          name: username,
          id: uuid
        }
      },
      hideErrors: false,
      logErrors: true,
      auth: 'mojang',
      skipValidation: true,
      checkTimeoutInterval: checkTimeoutInterval
    };

    const bot = new Bot();
    bot.instance = mineflayer.createBot(config);
    return bot;
  }

  static MojongAuth(ip:string, port:number, uuid:string, username:string, clientToken:string, accessToken:string, checkTimeoutInterval:number = 30000):Bot {
    throw new Error('[Deprecated] Please use Microsoft account to login');
  }

  static CrackedAuth(ip:string, port:number, username:string, checkTimeoutInterval:number = 30000):Bot {
    const config:mineflayer.BotOptions = {
      host: ip,
      port: port,
      username: username,
      hideErrors: false,
      logErrors: true,
      checkTimeoutInterval: checkTimeoutInterval
    };

    const bot = new Bot();
    bot.instance = mineflayer.createBot(config);
    return bot;
  }
}