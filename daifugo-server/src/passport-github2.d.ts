declare module 'passport-github2' {
  import { Strategy as PassportStrategy } from 'passport';
  export class Strategy extends PassportStrategy {}
  export default Strategy;
}
