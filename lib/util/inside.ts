import { Vec3 } from 'vec3'

export function isBetween(ptA:number, ptB:number, val:number):boolean {
  const dist_A = Math.abs(ptA - val);
  const dist_B = Math.abs(ptB - val);
  const dist = Math.abs(ptA - ptB);
  return dist_A + dist_B <= dist;
}

export function inside(vecA:Vec3, vecB:Vec3, val:Vec3):boolean {
  for(let i = 0; i < 3; ++i){
    if(!isBetween(vecA.toArray()[i], vecB.toArray()[i], val.toArray()[i])) 
      return false;
  }
  return true;
}