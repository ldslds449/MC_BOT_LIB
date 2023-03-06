import { MicrosoftTokenHelper, MicrosoftTokenRequest, MicrosoftTokenResponse, MicrosoftTokenError } from "../microsoft";
import { AxiosError, AxiosResponse } from 'axios';
import { post } from "../../../util/request";
import { Token } from '../../helper';
import nanoid from "nanoid";
import pkceChallenge from 'pkce-challenge';
import http from 'http';

interface GrantCodeRequest{
  client_id:string;
  response_type:string;
  redirect_uri:string;
  scope:string;
  response_mode:string;
  state:string;
  code_challenge?:string;
  code_challenge_method?:string;
};

export class MicrosoftTokenBasicHelper extends MicrosoftTokenHelper {
  state:string;
  grant_code:string;

  usePKCE:boolean;
  pkce:{
    code_verifier:string;
    code_challenge:string;
  };

  title:string;
  message:string;
  timeout:number;

  MicrosoftAuthURL:string = 'https://login.live.com/oauth20_authorize.srf';

  constructor(_client_id:string, _redirect_url:string, _usePKCE:boolean = true, _title:string = 'Authorization successful', _message:string = 'Close the tab', _timeout:number = 300000){
    super(_client_id, _redirect_url);
    this.usePKCE = _usePKCE;
    this.title = _title;
    this.message = _message;
    this.timeout = _timeout;
  }
  
  public getGrantCodeURL():string {
    this.state = nanoid.nanoid(32);
    if(this.usePKCE) this.pkce = pkceChallenge(128);

    const data:GrantCodeRequest = {
      client_id: this.client_id,
      response_type: 'code', // for authorization code flow
      redirect_uri: this.redirect_uri,
      scope: 'XboxLive.signin offline_access', // get xboxlive access permission 
      response_mode: 'query',
      state: this.state,
      code_challenge: this.usePKCE ? this.pkce.code_challenge : undefined,
      code_challenge_method: this.usePKCE ? 'S256' : undefined // SHA256
    };

    let url = new URL(this.MicrosoftAuthURL);
    for (const [key, value] of Object.entries(data)) {
      if(value == undefined) continue;
      url.searchParams.append(key, value)
    }

    return url.toString()
  }

  // timeout: ms
  private async listenerForGrantCode():Promise<string> {
    // grant code
    let server:http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    const code_promise = new Promise<string>((resolve) => {
      server = http.createServer((req, res) => {
        const req_url = new URL('http://' + req.headers.host + req.url);
        const req_state = req_url.searchParams.get('state');
        // verify the state
        if(req_state != this.state){
          res.statusCode = 400;
          throw new Error(`Error in 'listenerForGrantCode': state is not match (${req_state} != ${this.state})`)
        }else{
          // get the grant code
          const grant_code = req_url.searchParams.get('code');
          // show the message to user
          const body = `<link rel="icon" href="data:,"><div style="height: 100%;font-size: 25px;font-family: Courier New, Courier, monospace;color: black;position: relative;"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;"><h1>${this.title}</h1><hr><p>${this.message}</p></div></div>`;

          res.writeHead(200, {
            'Content-Length': Buffer.byteLength(body),
            'Content-Type': 'text/html'
          });
          res.write(body);
          res.end();
          resolve(grant_code);
        }
      });
  
      const url = new URL(this.redirect_uri);
      const ip = url.hostname;
      const port = Number(url.port);
  
      server.on('error', (e:NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE') {
          throw new Error(`Error in 'listenerForGrantCode': port ${port} is used)`)
        }
      });
      
      server.listen(port, ip, () => {
        console.log(`Server listen on ${ip}:${port}`);
      });
    })
    
    // timeout
    let timer:NodeJS.Timeout;
    const timeout_promise = new Promise<string>((_, reject) => {
      timer = setTimeout(() => {
        reject();
      }, this.timeout);
    });
    
    // return
    return await Promise.race([code_promise, timeout_promise])
      .finally(() => {
        server.close();
        clearTimeout(timer);
      });
  }

  private async getMicrosoftToken(grantCode:string):Promise<MicrosoftTokenResponse> {
    const data:MicrosoftTokenRequest = {
      client_id: this.client_id,
      grant_type: 'authorization_code',
      code: grantCode,
      redirect_uri: this.redirect_uri,
      code_verifier: this.usePKCE ? this.pkce.code_verifier : undefined,
      refresh_token: undefined // first time to get the token
    };
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };

    return await post<MicrosoftTokenRequest, MicrosoftTokenResponse>(
      this.MicrosoftTokenURL, data, {headers: headers})
      .then((success:AxiosResponse<MicrosoftTokenResponse>) => {
        return success.data;
      }, (fail:AxiosError<MicrosoftTokenError>) => {
        throw new Error(`Response Error in 'getMicrosoftToken': ${fail.response.data}, data:${data}`);
      });
  }

  public async getToken():Promise<Token> {
    let token:Token = {
      refresh_token: '',
      minecraft_token: ''
    };
    // get grant code
    return await this.listenerForGrantCode()
      // get access token
      .then((success) => {
        return this.getMicrosoftToken(success);
      })
      // get minecraft token
      .then((success) => {
        token.refresh_token = success.refresh_token;
        return this.getTokenFlow(success.access_token);
      })
      .then((success) => {
        token.minecraft_token = success;
        return token;
      })
      // Handle reponse error
      .catch(err => {
        console.error(err);
        throw new Error(err);
      });
  }
}