// time: ms
export async function sleep(time:number):Promise<void> {
  return await new Promise(resolve => setTimeout(resolve, time));
}