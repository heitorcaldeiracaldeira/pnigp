const HOST="https://transparencia.e-publica.net";
const r=await fetch(HOST+"/epublica-portal/",{headers:{"User-Agent":"Mozilla/5.0"}});
const html=await r.text();
console.log("index len",html.length);
const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
const links=[...html.matchAll(/<link[^>]+href="([^"]+\.js)"/g)].map(m=>m[1]);
console.log("scripts:", JSON.stringify([...scripts,...links],null,1));
