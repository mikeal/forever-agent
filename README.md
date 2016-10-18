# forever-agent

HTTP Agent that keeps socket connections alive between keep-alive requests.
Formerly part of mikeal/request, now a standalone module.

## Installation

`forever-agent` can be installed with npm:
```bash
npm install forever-agent [--save]
```

## Usage

The `ForeverAgent` and `ForeverAgent.SSL` are classes that extend `http.Agent`
and `https.Agent` respectively.

Many popular request libraries already support `forever-agent` out of the box,
but global usage can be achieved with the following code snippet:

```js
var ForeverAgent = require("forever-agent");
var http = require("http");
var https = require("https");

var options = {};
http.globalAgent = new ForeverAgent(options);
https.globalAgent = new ForeverAgent.SSL(options);
```
where `options` is like the following:
```ts
interface Options {
    // Maximum number of sockets to allow per host.
    maxSockets?: number;
    // Minimum amount of sockets that should be retained.
    minSockets?: number;
}
```
 