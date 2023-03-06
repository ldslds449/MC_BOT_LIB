export const ifit = (name:string, condition: () => boolean, fn?: jest.ProvidesCallback, timeout?: number) => {
  if(!condition()){
    // console.warn(`[skipping]: ${name}`);
    it.skip(name, () => {});
  }else{
    it(name, fn, timeout);
  }
}

export function checkEnvVar(name:string):boolean {
  return name in process.env && (process.env[name]?.length as number) > 0;
}