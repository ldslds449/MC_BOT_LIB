import { TokenHelper, Token } from "../helper";

class CrackedToken extends TokenHelper{
  public isAccountValid(_?:string): Promise<boolean> {
    return new Promise(() => true);
  }
  public getToken(): Promise<Token> {
    return new Promise(() => undefined);
  }
  
}