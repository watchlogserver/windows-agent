const si = require('systeminformation');
const os = require('os')
const fs = require('fs')
const { WebSocketServer } = require('ws');
const axios = require('axios');
const port = 3774
const watchlog_server = process.env.WATCHLOG_SERVER
const apiKey = process.env.WATCHLOG_APIKEY
var ioServer = require('socket.io-client');
const watchlogServerSocket = ioServer.connect(watchlog_server, { reconnect: true });
const express = require('express')
const app = express()
const exec = require('child_process').exec;
const path = require('path')
const configFilePath = path.join(__dirname, './../.env');
const integrations = require("./../integration.json")
const pm2Integration = require('./integrations/pm2')
const dockerIntegration = require('./integrations/docker')



module.exports = class Application {
    constructor() {
        this.startApp()
    }


    async startApp() {

        const systemInfo = await si.system();
        const systemOsfo = await si.osInfo();
        let uuid = ""
        if (!process.env.UUID) {
            if (systemOsfo.serial && systemOsfo.serial.length > 0) {
                uuid = systemOsfo.serial
            } else if (systemInfo.uuid && systemInfo.uuid.length > 0) {
                uuid = systemInfo.uuid
            } else {
                uuid = systemOsfo.hostname
            }
            fs.appendFileSync(configFilePath, `\nUUID=${uuid}`, 'utf8');


        } else {
            uuid = process.env.UUID
        }



        if (!apiKey) {
            return console.log(new Error("Watchlog Server is not found"))
        }
        if (await this.checkApiKey(uuid, systemOsfo.distro, systemOsfo.release)) {
            this.runAgent(uuid)
        } else {
            console.log("Something went wrong.")
            setTimeout(() => {
                this.runAgent()
            }, 10000)
        }
        // send axios request for check api
    }

    runAgent(uuid) {
        app.listen(port, () => console.log(`Watchlog api agent is running on port 3774`))
        this.getRouter(uuid)
        const wss = new WebSocketServer({ port: 3775, host: "127.0.0.1" }, () => console.log("Watchlog agent is running on port 3775"));
        wss.on('connection', function connection(ws) {
            ws.on('error', console.error);

            ws.on('message', function message(data) {
                try {
                    let body = JSON.parse(data)
                    switch (body.method) {
                        case 'increment':
                            if (body.metric && body.count) {
                                watchlogServerSocket.emit('increment', { ...body, apiKey, type: 1 })
                            }
                            break;
                        case 'decrement':
                            if (body.metric && body.count) {
                                watchlogServerSocket.emit('decrement', { ...body, apiKey, type: 1 })
                            }
                            break;
                        case 'distribution':
                            if (body.metric && body.count) {
                                watchlogServerSocket.emit('distribution', { ...body, apiKey, type: 1 })
                            }
                            break;
                        case 'gauge':
                            if (body.metric && body.count) {
                                watchlogServerSocket.emit('gauge', { ...body, apiKey, type: 1 })
                            }
                            break;
                        case 'percentage':
                            if (body.metric && body.count) {
                                watchlogServerSocket.emit('percentage', { ...body, apiKey, type: 1 })
                            }
                            break;
                        case 'systembyte':
                            if (body.metric && body.count) {
                                watchlogServerSocket.emit('systembyte', { ...body, apiKey, type: 1 })
                            }
                            break;
                        case 'log':
                            if (body.service && body.message) {
                                watchlogServerSocket.emit('log', { ...body, type: 1 })
                            }
                            break;
                        default:
                            null
                        // code block
                    }
                } catch (error) {
                    console.log(error.message)
                }
            });

        });
        setInterval(this.collectMetrics, 60000);
        // this.collectMetrics()
    }

    getRouter(uuid) {
        app.get("/", async (req, res) => {
            try {
                if (watchlogServerSocket.connected) {
                    let body = req.query
                    res.end()
                    switch (body.method) {
                        case 'increment':
                            if (body.metric && body.value) {
                                watchlogServerSocket.emit('increment', { ...body, type: 1 })
                            }
                            break;
                        case 'decrement':
                            if (body.metric && body.value) {
                                watchlogServerSocket.emit('decrement', { ...body, type: 1 })
                            }
                            break;
                        case 'distribution':
                            if (body.metric && body.value) {
                                watchlogServerSocket.emit('distribution', { ...body, type: 1 })
                            }
                            break;
                        case 'gauge':
                            if (body.metric && body.value) {
                                watchlogServerSocket.emit('gauge', { ...body, type: 1 })
                            }
                            break;
                        case 'percentage':
                            if (body.metric && body.value) {
                                watchlogServerSocket.emit('percentage', { ...body, type: 1 })
                            }
                            break;
                        case 'systembyte':
                            if (body.metric && body.value) {
                                watchlogServerSocket.emit('systembyte', { ...body, type: 1, uuid: uuid })
                            }
                            break;
                        case 'log':
                            if (body.service && body.message) {
                                watchlogServerSocket.emit('log', { ...body, host: "membersgram", apiKey, type: 1, uuid: uuid })
                            }
                            break;
                        default:
                            null
                    }
                }
            } catch (error) {
                console.log(error.message)
            }
        })
    }

    async checkApiKey(uuid, distro, release) {
        try {
            let response = await axios.get(`${watchlog_server}/checkapikey?apiKey=${apiKey}`)
            if (response.status == 200) {
                if (response.data.status == "success") {

                    watchlogServerSocket.emit("setApiKey", { apiKey, host: os.hostname(), ip: getSystemIP(), uuid: uuid, distro: distro, release: release })
                    return true
                } else {
                    if (response.data.message) {
                        console.log(response.data.message)
                    }
                    return false
                }
            } else {
                return false
            }
        } catch (error) {
            console.log(error.message)
            return false
        }
    }


    // to collect and log metrics
    async collectMetrics() {

        try {

            for(let index in integrations){

                if(integrations[index].service == 'pm2'){
                    pm2Integration.getData((result, err) => {
                        if(result){
                            watchlogServerSocket.emit("integrations/pm2service", {
                                data: {
                                    apps : result
                                }
                            })
                        }
                    })
                    break
                }
            }
        } catch (error) {
        }

        try {
            for(let integrate in integrations){
                if(integrations[integrate].service == 'docker' && integrations[integrate].monitor == true){
                    dockerIntegration.getData((result, err) => {
                        if(result){
                            watchlogServerSocket.emit("dockerInfo", {
                                data: result
                            })
                        }
                    })
                    break
                }
            }
        } catch (error) {
            
        }


        try {
         



            si.fsSize().then(disks => {
                let used = 0
                let total = 0
                let disksMetrics = []

                disks.forEach(item => {
                    if (!isNaN(Number(item.used))) {
                        disksMetrics.push({ metric: `system.disk.${item.fs}.used`, count: item.used, tag: "disk" })
                        disksMetrics.push({ metric: `system.disk.${item.fs}.size`, count: item.size, tag: "disk" })
                        used += item.used
                        if (total < item.size) {
                            total = item.size
                        }
                    }
                })

                used += 23243434
                disksMetrics.push({
                    metric: `system.disk.total`, count: total, tag: "disk"
                })
                disksMetrics.push({
                    metric: `system.disk.use`, count: used, tag: "disk"
                })
                disksMetrics.push({
                    metric: `system.disk.usagePercent`, count: Math.round((used / total) * 100), tag: "disk"
                })




                watchlogServerSocket.emit("serverMetricsArray", {
                    data: disksMetrics
                })

            });



            watchlogServerSocket.emit('serverMetrics', {
                metric: 'uptime',
                count: os.uptime(),
                tag: "uptime"
            });



            // cpu metrics
            si.currentLoad().then(cpuData => {
                const cpuUsage = cpuData.currentLoad.toFixed(2);
                watchlogServerSocket.emit("serverMetricsArray", {
                    data: [
                        {
                            metric: `system.cpu.used`, count: cpuUsage, tag: 'cpu'
                        }
                    ]
                })
            });


            // memory metrics
            si.mem().then(memData => {
                const memUsage = {
                    total: memData.total,
                    free: memData.free + memData.cached,
                    used: memData.used - memData.cached,
                    cached: memData.cached,
                    buffcache: memData.buffcache

                };
                let serverMetrics = [
                    {
                        metric: `system.memory.used`, count: memUsage.used, tag: 'memory'
                    },
                    {
                        metric: `system.memory.free`, count: memUsage.free + memUsage.cached, tag: "memory"
                    },
                    {
                        metric: `system.memory.usagePercent`, count: Math.round((memUsage.used / memUsage.total) * 100), tag: "memory"
                    },
                    {
                        metric: `system.memory.cache`, count: memUsage.cached, tag: "memory"
                    },
                    {
                        metric: `system.memory.buffcache`, count: memUsage.buffcache, tag: "memory"
                    }
                ]
                watchlogServerSocket.emit("serverMetricsArray", {
                    data: serverMetrics
                })


            });


            // network metrics - Bandwidth Usage 
            si.networkStats().then(networkStats => {
                let networks = []

                networkStats.forEach(network => {
                    networks.push({
                        metric: `network.${network.iface}.rx`,
                        count: network.rx_bytes,
                        tag: "networks"
                    })
                    networks.push({
                        metric: `network.${network.iface}.tx`,
                        count: network.tx_bytes,
                        tag: "networks"
                    })
                });


                watchlogServerSocket.emit("serverMetricsArray", {
                    data: networks
                })

            })


            // Active Connections
            si.networkConnections().then(networkConnections => {
                const activeConnections = networkConnections.filter(conn => conn.state === 'ESTABLISHED').length;
                watchlogServerSocket.emit('serverMetrics', {
                    metric: 'network.activeConnections',
                    count: activeConnections,
                    tag: "activeconnection"
                });
            });


            // Latency
            si.inetLatency().then(ping => {
                watchlogServerSocket.emit('serverMetrics', {
                    metric: 'network.latency',
                    count: ping,
                    tag: "latency"
                });
            });




        } catch (error) {

        }

    }

}

watchlogServerSocket.on('reconnect', async (attemptNumber) => {
    if (apiKey) {
        const systemOsfo = await si.osInfo();
        const systemInfo = await si.system();

        let uuid = ""
        if (!process.env.UUID) {
            if (systemOsfo.serial && systemOsfo.serial.length > 0) {
                uuid = systemOsfo.serial
            } else if (systemInfo.uuid && systemInfo.uuid.length > 0) {
                uuid = systemInfo.uuid
            } else {
                uuid = systemOsfo.hostname
            }
            fs.appendFileSync(configFilePath, `\nUUID=${uuid}`, 'utf8');


        } else {
            uuid = process.env.UUID
        }

        watchlogServerSocket.emit("setApiKey", { apiKey, host: os.hostname(), ip: getSystemIP(), uuid: uuid, distro: systemOsfo.distro, release: systemOsfo.release })
    }

});



function getSystemIP() {
    const networkInterfaces = os.networkInterfaces();
    for (let interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];

        for (let iface of interfaces) {
            // Check if it's an IPv4 address and not internal (i.e., not a localhost address)
            if (iface.family === 'IPv4' && !iface.internal && !isPrivateIP(iface.address)) {
                return iface.address;
            }
        }
    }

    return null; // No valid external IP found
}



// Function to check if an IP is private
function isPrivateIP(ip) {
    // Convert IP to an integer for easier comparison
    const parts = ip.split('.').map(Number);
    const ipNum = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];

    // Check against private IP ranges
    return (
        (ipNum >= (10 << 24) && ipNum <= ((10 << 24) + 0xFFFFFF)) ||            // 10.0.0.0 - 10.255.255.255
        (ipNum >= (172 << 24 | 16 << 16) && ipNum <= (172 << 24 | 31 << 16 | 0xFFFF)) || // 172.16.0.0 - 172.31.255.255
        (ipNum >= (192 << 24 | 168 << 16) && ipNum <= (192 << 24 | 168 << 16 | 0xFFFF)) || // 192.168.0.0 - 192.168.255.255
        (ipNum >= (127 << 24) && ipNum <= (127 << 24 | 0xFFFFFF))               // 127.0.0.0 - 127.255.255.255 (loopback)
    );
}