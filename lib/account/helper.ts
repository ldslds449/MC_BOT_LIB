import { get } from '../util/request';
import { AxiosResponse, AxiosError } from 'axios';

export interface Token{
  refresh_token:string;
  minecraft_token:string;
};

export interface UserInfo{
  id:string;
  name:string;
  skin:{
    id:string;
    state:string;
    url:string;
    variant:string;
  }[],
  capes:{
    id:string;
    state:string;
    url:string;
    alias:string;
  }[],
  profileActions:unknown;
};

interface UserInfoError{
  path:string;
  erorrType:string;
  error:string;
  errorMessage:string;
  developerMessage:string;
};

export abstract class TokenHelper {
  MinecraftProfileURL:string = 'https://api.minecraftservices.com/minecraft/profile';

  public abstract getToken():Promise<Token>;

  public async getUserInfo(minecraftToken:string):Promise<UserInfo> {
    const config:any = {
      headers: {
        'Authorization': `Bearer ${minecraftToken}`
      }
    };

    return await get<UserInfo>(this.MinecraftProfileURL, config)
      .then((success:AxiosResponse<UserInfo>) => {
        return success.data;
      }, (fail:AxiosError<UserInfoError>) => {
        console.error(fail.response.data);
        throw new Error(`Response Error in 'getUserInfo(${minecraftToken})': error: ${fail.response.data}`);
      });
  }
}





