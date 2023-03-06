import { TokenHelper, Token } from "../helper"

class MojangToken extends TokenHelper{
  public isAccountValid(minecraftToken:string): Promise<boolean> {
    throw new Error("Deprecated");
  }

  public getToken(): Promise<Token> {
    throw new Error("Deprecated");
  }
}