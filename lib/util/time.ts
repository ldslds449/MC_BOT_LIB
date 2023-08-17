// time: ms
export async function sleep(time:number):Promise<void> {
  return await new Promise(resolve => setTimeout(resolve, time));
}

const debug = require('debug')('MC_BOT_LIB:time');

export async function onlyWaitForSpecTime(task:Promise<any>, time_limit:number, callback:()=>void):Promise<boolean>{
  let timer:NodeJS.Timeout;
  const timeout_promise = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      if(callback != undefined) callback();
      resolve();
    }, time_limit);
  }).then(() => { return false; });
  return Promise.race([timeout_promise,
    task.then(() => {
      clearTimeout(timer);
      return true;
    }).catch((err) => {
      debug(err); 
      return false;
    })
  ]);
}