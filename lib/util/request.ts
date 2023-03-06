import axios, { AxiosResponse, AxiosRequestConfig } from 'axios'

export async function post<Req_T, Res_T>(url:string, data:Req_T, config?:AxiosRequestConfig<any>): Promise<AxiosResponse<Res_T>> {
  return await axios.post<Req_T, AxiosResponse<Res_T>>(url, data, config);
}

export async function get<Res_T>(url:string, config?:AxiosRequestConfig<any>): Promise<AxiosResponse<Res_T>> {
  return await axios.get<Res_T>(url, config);
}
