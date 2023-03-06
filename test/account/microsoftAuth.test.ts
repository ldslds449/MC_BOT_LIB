import { MicrosoftTokenBasicHelper } from '../../lib/account/token/microsoft/basic';
import { MicrosoftTokenDeviceHelper } from '../../lib/account/token/microsoft/device';
import { sleep } from '../../lib/util/sleep';
import { ifit, checkEnvVar } from '../util'

describe('Microsoft Auth (Basic)', () => {

  const test_microsoft_grant_code_helper = (done:any, helper:MicrosoftTokenBasicHelper) => {
    let url = helper.getGrantCodeURL();
    
    let code = helper['listenerForGrantCode']();
    sleep(500);
    console.log(`Please open this link in browser: ${url}`);

    code.then((success) => {
      process.env.TEST_GRANT_CODE = success;
      done();
    }).catch((error) => {
      done(error);
    });
  };

  const test_microsoft_token_helper = (done:any, helper:MicrosoftTokenBasicHelper) => {
    if(!checkEnvVar('TEST_GRANT_CODE')) done('TEST_GRANT_CODE: ENV Not Found');

    let grant_code:string = process.env.TEST_GRANT_CODE as string;
    let token = helper['getMicrosoftToken'](grant_code);

    token.then((success) => {
      process.env.TEST_MICROSOFT_TOKEN = success.access_token;
      process.env.TEST_REFRESH_TOKEN = success.refresh_token;
      done();
    }).catch((error) => {
      console.info(`Grant Code: ${grant_code}`);
      done(error);
    });
  };

  describe('No PKCE', () => {
    let helper:MicrosoftTokenBasicHelper;

    beforeAll(() => {
      let client_id:string = process.env.TEST_CLIENT_ID_BASIC as string;
      let redirect_uri:string = process.env.TEST_REDIRECT_URI as string;

      helper = new MicrosoftTokenBasicHelper(client_id, redirect_uri, false);
    })

    describe('Microsoft Grant Code', ()=>{
      ifit('Get Microsoft Grant Code Successfully with no PKCE', 
        () => {
          return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
        }, (done) => test_microsoft_grant_code_helper(done, helper), 70000);
    });

    describe('Microsoft Token', ()=>{
      ifit('Get Microsoft Token Successfully with no PKCE', 
        () => {
          return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
        }, (done) => test_microsoft_token_helper(done, helper));
    });
  });

  describe('Use PKCE', () => {
    let helper:MicrosoftTokenBasicHelper;

    beforeAll(() => {
      let client_id:string = process.env.TEST_CLIENT_ID_BASIC as string;
      let redirect_uri:string = process.env.TEST_REDIRECT_URI as string;

      helper = new MicrosoftTokenBasicHelper(client_id, redirect_uri, true);
    })

    describe('Microsoft Grant Code', ()=>{
      ifit('Get Microsoft Grant Code Successfully with no PKCE', 
        () => {
          return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
        }, (done) => test_microsoft_grant_code_helper(done, helper), 70000);
    });

    describe('Microsoft Token', ()=>{
      ifit('Get Microsoft Token Successfully with no PKCE', 
        () => {
          return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
        }, (done) => test_microsoft_token_helper(done, helper));
    });
  });
  
  describe('Microsoft Token (Refresh)', () => {
    ifit('Refresh Microsoft Token Successfully', 
      () => {
        return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
      },
      (done) => {
        if(!checkEnvVar('TEST_REFRESH_TOKEN')) done('TEST_REFRESH_TOKEN: ENV Not Found');
        let client_id:string = process.env.TEST_CLIENT_ID_BASIC as string;
        let redirect_uri:string = process.env.TEST_REDIRECT_URI as string;
        let refresh_token:string = process.env.TEST_REFRESH_TOKEN as string;

        let helper:MicrosoftTokenBasicHelper = new MicrosoftTokenBasicHelper(client_id, redirect_uri);
        let token = helper['refreshMicrosoftToken'](refresh_token);

        token.then((success) => {
          process.env.TEST_MICROSOFT_TOKEN = success.access_token;
          process.env.TEST_REFRESH_TOKEN = success.refresh_token;
          done();
        }).catch((error) => {
          console.info(`Refresh Token: ${refresh_token}`);
          done(error);
        });
    });
  });

  describe('XBox Live Token', () => {
    ifit('Get XBox Live Token Successfully', 
      () => {
        return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
      },
      (done) => {
        if(!checkEnvVar('TEST_MICROSOFT_TOKEN')) done('TEST_MICROSOFT_TOKEN: ENV Not Found');
        let client_id:string = process.env.TEST_CLIENT_ID_BASIC as string;
        let redirect_uri:string = process.env.TEST_REDIRECT_URI as string;
        let microsoft_token:string = process.env.TEST_MICROSOFT_TOKEN as string;

        let helper:MicrosoftTokenBasicHelper = new MicrosoftTokenBasicHelper(client_id, redirect_uri);
        let token = helper['getXboxToken'](microsoft_token);

        token.then((success) => {
          process.env.TEST_XBOX_TOKEN = success.Token;
          done();
        }).catch((error) => {
          console.info(`Microsoft Token: ${microsoft_token}`);
          done(error);
        });
    });
  });

  describe('XSTS Token', () => {
    ifit('Get XSTS Token Successfully', 
      () => {
        return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
      },
      (done) => {
        if(!checkEnvVar('TEST_XBOX_TOKEN')) done('TEST_XBOX_TOKEN: ENV Not Found');
        let client_id:string = process.env.TEST_CLIENT_ID_BASIC as string;
        let redirect_uri:string = process.env.TEST_REDIRECT_URI as string;
        let xbox_token:string = process.env.TEST_XBOX_TOKEN as string;

        let helper:MicrosoftTokenBasicHelper = new MicrosoftTokenBasicHelper(client_id, redirect_uri);
        let token = helper['getXSTSToken'](xbox_token);

        token.then((success) => {
          process.env.TEST_XSTS_TOKEN = success.Token;
          process.env.TEST_UHS = success.DisplayClaims.xui[0].uhs;
          done();
        }).catch((error) => {
          console.info(`Xbox Token: ${xbox_token}`);
          done(error);
        });
    });
  });

  describe('Minecraft Token', () => {
    ifit('Get Minecraft Token Successfully', 
      () => {
        return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
      },
      (done) => {
        if(!checkEnvVar('TEST_XSTS_TOKEN')) done('TEST_XSTS_TOKEN: ENV Not Found');
        if(!checkEnvVar('TEST_UHS')) done('TEST_UHS: ENV Not Found');
        let client_id:string = process.env.TEST_CLIENT_ID_BASIC as string;
        let redirect_uri:string = process.env.TEST_REDIRECT_URI as string;
        let xsts_token:string = process.env.TEST_XSTS_TOKEN as string;
        let uhs:string = process.env.TEST_UHS as string;

        let helper:MicrosoftTokenBasicHelper = new MicrosoftTokenBasicHelper(client_id, redirect_uri);
        let token = helper['getMinecraftToken'](xsts_token, uhs);

        token.then((success) => {
          process.env.TEST_MINECRAFT_TOKEN = success.access_token;
          done();
        }).catch((error) => {
          console.info(`XSTS Token: ${xsts_token}, UHS: ${uhs}`);
          done(error);
        });
    });
  });

  describe('Refresh', () => {
    ifit('Use Refresh to Get Minecraft Token', 
      () => {
        return checkEnvVar('TEST_CLIENT_ID_BASIC') && checkEnvVar('TEST_REDIRECT_URI');
      },
      (done) => {
        if(!checkEnvVar('TEST_REFRESH_TOKEN')) done('TEST_REFRESH_TOKEN: ENV Not Found');

        let client_id:string = process.env.TEST_CLIENT_ID_BASIC as string;
        let redirect_uri:string = process.env.TEST_REDIRECT_URI as string;
        let refresh_token:string = process.env.TEST_REFRESH_TOKEN as string;

        let helper:MicrosoftTokenBasicHelper = new MicrosoftTokenBasicHelper(client_id, redirect_uri);
        let token = helper.refresh(refresh_token);

        token.then((success) => {
          process.env.TEST_MINECRAFT_TOKEN = success.minecraft_token;
          console.log(`Minecraft Token: ${success}`);
          expect(success).not.toBeUndefined();
          done();
        }).catch((error) => {
          console.info(`Refresh Token: ${refresh_token}`);
          done(error);
        });
    });
  });

  describe('Valid Account', () => {
    ifit('Account is Valid', 
      () => {
        return true;
      },
      (done) => {
        if(!checkEnvVar('TEST_MINECRAFT_TOKEN')) done('TEST_MINECRAFT_TOKEN: ENV Not Found');

        let minecraft_token:string = process.env.TEST_MINECRAFT_TOKEN as string;

        let helper:MicrosoftTokenBasicHelper = new MicrosoftTokenBasicHelper('', '');
        let result = helper.isAccountValid(minecraft_token);

        result.then((success) => {
          expect(success).toBe(true);
          done();
        }).catch((error) => {
          console.info(`Minecraft Token: ${minecraft_token}`);
          done(error);
        });
    });
  });
});

describe('Microsoft Auth (Device)', () => {
  
  describe('Microsoft Token', () => {
    let helper:MicrosoftTokenDeviceHelper;

    beforeAll(() => {
      let client_id:string = process.env.TEST_CLIENT_ID_DEVICE as string;

      helper = new MicrosoftTokenDeviceHelper(client_id);
    })

    ifit('Get Microsoft Access Token Successfully', 
      () => {
        return checkEnvVar('TEST_CLIENT_ID_DEVICE');
      }, (done) => {
        let auth_code = helper.getAuthCode();
        auth_code.then((success) => {
          console.log(`Please open this link in browser: ${helper.MicrosoftDeviceAuthURL}, Code: ${success.user_code}`);
        }).then(() => {
          let result = helper['loopForAccessToken']();

          result.then((success) => {
            process.env.TEST_MICROSOFT_TOKEN = success.access_token;
            process.env.TEST_REFRESH_TOKEN = success.refresh_token;
            done();
          }).catch((error) => {
            done(error);
          });
        })
      }, 70000);

      ifit('Get Minecraft Token using Microsoft Token', 
      () => {
        return checkEnvVar('TEST_CLIENT_ID_DEVICE');
      }, (done) => {
        if(!checkEnvVar('TEST_MICROSOFT_TOKEN')) done('TEST_MICROSOFT_TOKEN: ENV Not Found');
        
        let microsoft_token:string = process.env.TEST_MICROSOFT_TOKEN as string;
        let result = helper['getTokenFlow'](microsoft_token);

        result.then((success) => {
          process.env.TEST_MINECRAFT_TOKEN = success;
          done();
        }).catch((error) => {
          done(error);
        });
      });
  });

  describe('Get User Profile', () => {
    let helper:MicrosoftTokenDeviceHelper;

    beforeAll(() => {
      let client_id:string = process.env.TEST_CLIENT_ID_DEVICE as string;

      helper = new MicrosoftTokenDeviceHelper(client_id);
    })

    it('Get Microsoft Grant Code Successfully with no PKCE', 
      (done) => {
        if(!checkEnvVar('TEST_MICROSOFT_TOKEN')) done('TEST_MICROSOFT_TOKEN: ENV Not Found');
        
        let minecraft_token:string = process.env.TEST_MINECRAFT_TOKEN as string;
        let result = helper['getUserInfo'](minecraft_token);

        result.then((success) => {
          process.env.TEST_USERNAME = success.name;
          process.env.TEST_UUID = success.id;
          done();
        }).catch((error) => {
          done(error);
        });
      });
  });
});