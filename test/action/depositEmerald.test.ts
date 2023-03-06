import { BotFactory } from '../../lib/bot/create';
import { ifit, checkEnvVar } from '../util';
import { depositEmerald } from '../../lib/action/depositEmerald';
import { sleep } from '../../lib/util/sleep';
import { MicrosoftTokenHelper } from '../../lib/account/token/microsoft';

describe('Deposit Emerald', () => {

  ifit('Deposit Emerald', 
    () => {
      return checkEnvVar('TEST_SERVER_IP') && checkEnvVar('TEST_SERVER_PORT');
    },
    (done) => {
      if(!checkEnvVar('TEST_MINECRAFT_TOKEN')) done('TEST_MINECRAFT_TOKEN: ENV Not Found');
      if(!checkEnvVar('TEST_USERNAME')) done('TEST_USERNAME: ENV Not Found');
      if(!checkEnvVar('TEST_UUID')) done('TEST_UUID: ENV Not Found');
      
      const minecraft_token:string = process.env.TEST_MINECRAFT_TOKEN as string;
      if(!MicrosoftTokenHelper.isAccountValid(minecraft_token)) done('TEST_MINECRAFT_TOKEN: Not Valid');

      const ip:string = process.env.TEST_SERVER_IP as string;
      const port:number = Number(process.env.TEST_SERVER_PORT as string);
      const username: string = process.env.TEST_USERNAME as string;
      const uuid: string = process.env.TEST_UUID as string;

      const bot = BotFactory.MCAuth(ip, port, username, uuid, minecraft_token, 60 * 1000);

      bot.instance.once('spawn', async () => {

        await sleep(5000);
        
        for(let i = 0; i < 5; ++i){
          await depositEmerald(bot.instance);
          await sleep(2000);
        }

        bot.close();
        await sleep(2000);
        done();
      });

      bot.instance.once("kicked", (err) => {
        console.error(err);
      });

      bot.instance.on("error", (err) => {
        console.error(err);
      });

  }, 60000);
});