import { BotFactory } from '../../lib/bot/create';
import { ifit, checkEnvVar } from '../util';

describe('Create Bot', () => {

  describe('Create a Bot (Microsoft Auth)', ()=>{
    ifit('Create a Bot Successfully (Microsoft Auth)', 
      () => {
        return checkEnvVar('TEST_SERVER_IP') && checkEnvVar('TEST_SERVER_PORT');
      },
      (done) => {
        if(!checkEnvVar('TEST_MINECRAFT_TOKEN')) done('TEST_MINECRAFT_TOKEN: ENV Not Found');
        if(!checkEnvVar('TEST_USERNAME')) done('TEST_USERNAME: ENV Not Found');
        if(!checkEnvVar('TEST_UUID')) done('TEST_UUID: ENV Not Found');

        const minecraft_token:string = process.env.TEST_MINECRAFT_TOKEN as string;
        const ip:string = process.env.TEST_SERVER_IP as string;
        const port:number = Number(process.env.TEST_SERVER_PORT as string);
        const username: string = process.env.TEST_USERNAME as string;
        const uuid: string = process.env.TEST_UUID as string;

        expect(() => {
          const bot = BotFactory.MCAuth(ip, port, username, uuid, minecraft_token, 300);
          bot.instance.once('login', () => {
            bot.close();
            done();
          });
          bot.instance.on("error", (err) => {
            console.error(err);
          });
        }).not.toThrowError();

    }, 30000);
  });

  describe('Create a Bot (Cracked)', ()=>{
    ifit('Create a Bot Successfully (Cracked)', 
      () => {
        return checkEnvVar('TEST_SERVER_IP') && checkEnvVar('TEST_SERVER_PORT') && false;
      },
      (done) => {
        const ip:string = process.env.TEST_SERVER_IP as string;
        const port:number = Number(process.env.TEST_SERVER_PORT as string);
        const username: string = 'QAQ';

        expect(() => {
          const bot = BotFactory.CrackedAuth(ip, port, username, 300);
          bot.instance.once('spawn', () => {
            bot.close();
            done();
          });
        }).toThrowError();
    }, 30000);
  });
});