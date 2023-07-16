import { MicrosoftTokenHelper, MicrosoftTokenRequest, MicrosoftTokenResponse, MicrosoftTokenError } from "../microsoft";
import { AxiosError, AxiosResponse } from 'axios';
import { post } from "../../../util/request";
import { Token } from '../../helper';

interface DeviceCodeRequest{
  client_id:string;
  scope:string;
  response_type:string;
};

interface DeviceCodeResponse{
  user_code:string;
  device_code:string;
  verification_uri:string;
  interval:number;
  expires_in:number;
};

export class MicrosoftTokenDeviceHelper extends MicrosoftTokenHelper {
  request_interval:number;
  device_code:string;

  timeout:number;

  MicrosoftDeviceCodeURL:string = 'https://login.live.com/oauth20_connect.srf';
  MicrosoftTokenURL:string = 'https://login.live.com/oauth20_token.srf';
  MicrosoftDeviceAuthURL:string = 'https://login.live.com/oauth20_remoteconnect.srf';

  constructor(_client_id:string, _timeout:number = 900000){
    super(_client_id, '');
    this.timeout = _timeout;
  }
  
  public async getAuthCode():Promise<DeviceCodeResponse> {
    const data:DeviceCodeRequest = {
      client_id: this.client_id,
      scope: 'XboxLive.signin offline_access',
      response_type: 'device_code',
    };
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };

    return await post<DeviceCodeRequest, DeviceCodeResponse>
      (this.MicrosoftDeviceCodeURL, data, {headers: headers})
      .then((success:AxiosResponse<DeviceCodeResponse>) => {
        this.request_interval = Number(success.data.interval);
        this.device_code = success.data.device_code;
        return success.data;
      }, (fail:AxiosError<any>) => {
        throw new Error(`Response Error in 'getAuthCode()': ${JSON.stringify(fail)}, data:${JSON.stringify(data)}`);
      });
  }

  // timeout: ms
  private async loopForAccessToken():Promise<MicrosoftTokenResponse> {
    // get access token
    let wait = true;
    let loop:NodeJS.Timeout;
    const loop_promise = new Promise<MicrosoftTokenResponse>((resolve, reject) => {
      const data:MicrosoftTokenRequest = {
        client_id: this.client_id,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code', // for device
        device_code: this.device_code,
      }
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      };

      const loop_fn = () => {
        loop = setTimeout(() => {
          // try to get access token
          post<MicrosoftTokenRequest, MicrosoftTokenResponse>
            (this.MicrosoftTokenURL, data, {headers: headers})
            .then((success:AxiosResponse<MicrosoftTokenResponse>) => {
              // get the access token
              resolve(success.data);
            }, (fail:AxiosError<MicrosoftTokenError>) => {
              if(wait && (fail.response.data.error == 'authorization_pending')){
                // keep waiting
                loop_fn();
              }else{
                reject(`Response Error in 'loopForAccessToken(${this.timeout}): ${JSON.stringify(fail.response.data)}, data: ${JSON.stringify(data)}'`);
              }
            })
        }, this.request_interval * 1000);
      }
      // run first time
      loop_fn();
    });
    
    // timeout
    let timer:NodeJS.Timeout;
    const timeout_promise = new Promise<MicrosoftTokenResponse>((_, reject) => {
      timer = setTimeout(() => {
        reject();
      }, this.timeout);
    });
    
    // return
    return await Promise.race([loop_promise, timeout_promise])
      .finally(() => {
        wait = false;
        clearTimeout(loop);
        clearTimeout(timer);
      });
  }

  public async getToken(): Promise<Token>{
    let token:Token = {
      refresh_token: '',
      minecraft_token: ''
    };

    return await this.loopForAccessToken()
      .then((success) => {
        token.refresh_token = success.refresh_token;
        return this.getTokenFlow(success.access_token);
      })
      .then((success) => {
        token.minecraft_token = success;
        return token;
      })// Handle reponse error
      .catch(err => {
        console.error(err);
        throw new Error(err);
      });
  }
}