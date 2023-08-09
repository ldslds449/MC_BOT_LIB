import { TokenHelper } from "../helper"
import { post, get } from "../../util/request"
import { AxiosResponse, AxiosError } from 'axios'
import { Token } from '../helper';

export interface MicrosoftTokenRequest{
  client_id:string;
  grant_type:string;
  code?:string;
  redirect_uri?:string;
  code_verifier?:string;
  refresh_token?:string;
  device_code?:string;
};

export interface MicrosoftTokenResponse{
  token_type:string;
  expires_in:number;
  scope:string;
  access_token:string;
  refresh_token:string;
  user_id:string;
};

export interface MicrosoftTokenError{
  error:string;
  error_description:number;
  correlation_id:string;
};

interface XboxTokenRequest{
  Properties:{
    AuthMethod:string;
    SiteName:string;
    RpsTicket:string;
  }
  RelyingParty:string;
  TokenType:string;
}

interface XboxXSTSTokenResponse{
  IssueInstant:string;
  NotAfter:string;
  Token:string;
  DisplayClaims:{
    xui:[
      {
        uhs:string;
      }
    ]
  };
}

interface XSTSTokenRequest{
  Properties:{
    SandboxId:string;
    UserTokens:string[];
  }
  RelyingParty:string;
  TokenType:string;
}

interface XSTSTokenError{
  Identity:string;
  XErr:number;
  Message:string;
  Redirect:string;
}

interface MinecraftTokenRequest{
  identityToken:string;
}

interface MinecraftTokenResponse{
  username:string; // UUID
  roles:any[]; // unknown
  access_token:string;
  token_type:string;
  expires_in:number;
}

interface MinecraftTokenError{
  path:string;
  error:string;
}

interface GameOwnerResponse{
  items: {
    name:string;
    signature:string;
  }[],
  signature:string;
  keyId:string;
};

interface GameOwnerInfo{
  entitlements: {
    name:string;
  }[],
  signerId:string;
  nbf:number;
  exp:number;
  iat:number;
  platform:string;
}

export abstract class MicrosoftTokenHelper extends TokenHelper {
  protected client_id:string;
  protected redirect_uri:string;

  protected UUID:string;

  protected MicrosoftTokenURL:string = 'https://login.live.com/oauth20_token.srf';

  XboxTokenURL:string = 'https://user.auth.xboxlive.com/user/authenticate';
  XSTSTokenURL:string = 'https://xsts.auth.xboxlive.com/xsts/authorize';
  MinecraftTokenURL:string = 'https://api.minecraftservices.com/authentication/login_with_xbox';
  static MicrosoftStoreURL:string = 'https://api.minecraftservices.com/entitlements/mcstore';

  constructor(_client_id:string, _redirect_url:string){
    super();
    this.client_id = _client_id;
    this.redirect_uri = _redirect_url;
  }

  private async refreshMicrosoftToken(refreshToken:string):Promise<MicrosoftTokenResponse> {
    const data:MicrosoftTokenRequest = {
      client_id: this.client_id,
      grant_type: 'refresh_token',
      code: undefined,
      redirect_uri: this.redirect_uri.length > 0 ? this.redirect_uri : undefined,
      code_verifier: undefined, // there is no need to send verifier while refreshing the access token
      refresh_token: refreshToken
    };
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };

    return await post<MicrosoftTokenRequest, MicrosoftTokenResponse>(
      this.MicrosoftTokenURL, data, {headers: headers})
      .then((success:AxiosResponse<MicrosoftTokenResponse>) => {
        return success.data;
      }, (fail:AxiosError<MicrosoftTokenError>) => {
        throw new Error(`Response Error in 'refreshMicrosoftToken(${refreshToken})': ${JSON.stringify(fail.response.data)}, data:${JSON.stringify(data)}`);
      });
  }

  // get a blank response content while an error occurs
  private async getXboxToken(microsoftToken:string):Promise<XboxXSTSTokenResponse> {
    const data:XboxTokenRequest = {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: 'd=' + microsoftToken
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    };
    const config:any = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    return await post<XboxTokenRequest, XboxXSTSTokenResponse>(this.XboxTokenURL, data, config)
      .then((success:AxiosResponse<XboxXSTSTokenResponse>) => {
        return success.data;
      }, (fail:AxiosError<any>) => {
        throw new Error(`Response Error in 'getXboxToken(${microsoftToken})': ${fail}, data:${data}`);
      });
  }

  // could get a blank response content while an error occurs 
  // or XSTSTokenError
  private async getXSTSToken(xboxToken:string):Promise<XboxXSTSTokenResponse> {
    const data:XSTSTokenRequest = {
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xboxToken]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    };
    const config:any = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    return await post<XSTSTokenRequest, XboxXSTSTokenResponse>(this.XSTSTokenURL, data, config)
      .then((success:AxiosResponse<XboxXSTSTokenResponse>) => {
        return success.data;
      }, (fail:AxiosError<XSTSTokenError>) => {
        throw new Error(`Response Error in 'getXSTSToken(${xboxToken})': ${fail.response.data}, data:${data}`);
      });
  }

  private async getMinecraftToken(xtstToken:string, userHash:string):Promise<MinecraftTokenResponse> {
    const data:MinecraftTokenRequest = {
      identityToken: `XBL3.0 x=${userHash};${xtstToken}`
    };
    const config:any = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    return await post<MinecraftTokenRequest, MinecraftTokenResponse>(
      this.MinecraftTokenURL, data, config)
      .then((success:AxiosResponse<MinecraftTokenResponse>) => {
        return success.data;
      }, (fail:AxiosError<MinecraftTokenError>) => {
        throw new Error(`Response Error in 'getMinecraftToken(${xtstToken}, ${userHash})': ${JSON.stringify(fail.response.data)}, data:${JSON.stringify(data)}`);
      });
  }

  // use Microsoft access token to get an access token to login Minecraft
  protected async getTokenFlow(microsoftToken:string):Promise<string> {
    return await this.getXboxToken(microsoftToken)
      // Microsoft Token -> XBox Live Token
      .then((success) => {
        return this.getXSTSToken(success.Token);
      })
      // XBox Live Token -> XSTS Token
      .then((success) => {
        return this.getMinecraftToken(success.Token, success.DisplayClaims.xui[0].uhs);
      })
      // XSTS Token -> Minecraft Token
      .then((success) => {
        this.UUID = success.username;
        return success.access_token;
      })
      // Handle reponse error
      .catch(err => {
        console.error(err);
        throw new Error(err);
      });
  }

  public async refresh(refreshToken:string):Promise<Token> {
    let token:Token = {
      refresh_token: '',
      minecraft_token: ''
    };

    return await this.refreshMicrosoftToken(refreshToken)
      // refresh microsoft token
      .then((success:MicrosoftTokenResponse) => {
        token.refresh_token = success.refresh_token;
        return this.getTokenFlow(success.access_token);
      })
      // run token flow
      .then((success:string) => {
        token.minecraft_token = success;
        return token;
      })
      // Handle reponse error
      .catch(err => {
        console.error(err);
        throw new Error(err);
      });
  }

  public static async isAccountValid(minecraftToken:string):Promise<boolean> {
    const config:any = {
      headers: {
        'Authorization': `Bearer ${minecraftToken}`
      }
    };

    return await get<GameOwnerResponse>(this.MicrosoftStoreURL, config)
      .then((success) => {
        const jwt = success.data.signature;
        const info_string = Buffer.from(jwt.split('.')[1], 'base64').toString('utf8');
        const info_json = JSON.parse(info_string);
        const info = info_json as GameOwnerInfo;
        return info.entitlements.find(x => x.name == 'game_minecraft' || x.name == 'product_minecraft') != undefined;
      }, () => {
        return false;
      });
    
  }

}

