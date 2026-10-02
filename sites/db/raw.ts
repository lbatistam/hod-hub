import {env} from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('Banco indisponível');return env.DB}
export async function all<T>(sql:string,...args:unknown[]){return (await database().prepare(sql).bind(...args).all<T>()).results}
export async function one<T>(sql:string,...args:unknown[]){return database().prepare(sql).bind(...args).first<T>()}
export async function run(sql:string,...args:unknown[]){return database().prepare(sql).bind(...args).run()}
export async function batch(statements:D1PreparedStatement[]){for(let i=0;i<statements.length;i+=50)await database().batch(statements.slice(i,i+50))}
