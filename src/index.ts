import {exec, spawn} from 'child_process';
import { NvidiaSMI } from "@quik-fe/node-nvidia-smi";

console.log("hello world!");

let first = true;
let queuedMessages: string[] = [];
let lastMessageSend = 0
function log(msg: string | undefined, color = "", sendNow = false): void {
    const url = process.env.DISCORD_LOG_WEBHOOK;
    if(!url) {
        if(first) {
            first = false;
            console.warn("Falsy webhook url!")
        }
        return;
    }
    if(msg) queuedMessages.push(msg);
    if((Date.now() - lastMessageSend > 2e3 || sendNow) && queuedMessages.length > 0) {
        lastMessageSend = Date.now();
        let msgs = [];
        let lastMessage: string | undefined;
        do {
            lastMessage = queuedMessages.shift();
            msgs.push(lastMessage);
        } while(queuedMessages.length > 0);
        msgs = msgs.map(m => m?.split("\n")).flat()
        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: msgs.filter(m => !!m).map(msg => "```ansi" + "\n" + color + msg + "\n```").join("")
            }),
        }).then(async r => {
            if(!r.ok && first) {
                first = false;
                console.warn("Non-ok when sending webhook:", r.status, r.statusText, await r.text());
            }
        })
    }
}

(async () => {
    if(await NvidiaSMI.exist()) {
        console.log({
            gpuInfos: await NvidiaSMI.Utils.get_gpus(),
            memoryUsage: await NvidiaSMI.Utils.getMemoryUsage(),
        })
    } else {
        console.warn("Missing NvidiaSMI")
    }
})();

const file = process.env.BLEND_FILE_NAME ?? "dounut_small.blend";

log("hello world!");

exec("wget https://pub-dd273e04901f409f8dbd9aee5b39ded6.r2.dev/" + encodeURI(file), (error, stdout, stderr) => {
    if(error) console.log("error:", error);
    // lines are filter to exclude all of the progress lines from spamming the logs
    console.log(stdout.split("\n").filter(l => !l.includes("..........")).join("\n").toString());
    console.log(stderr.split("\n").filter(l => !l.includes("..........")).join("\n").toString());
    if(!error) {
        const args = [
            file,
            ..."-b -f 160 -- --cycles-device OPTIX".split(" ")
        ]
        const render = spawn("/usr/local/blender/blender", args);
        render.stdout.on('data', function (data) {
            console.log('stdout: ' + data.toString());
            log(data.toString());
        });

        render.stderr.on('data', function (data) {
            console.log('stderr: ' + data.toString());
            log(data.toString(), "\u001b[0;31m");
        });
        render.on('exit', function (code) {
            log("<@171160105155297282> blender render finished.", undefined, true);
            if(code != 0) {
                console.log('child process exited with code ' + code?.toString());
            } else {
                console.log("Done!");

                console.log("Attempting runpodctl terminate in 10 seconds");
                setTimeout(() => {
                    const terminate = spawn("/usr/bin/runpodctl", ["remove", "pod", process.env.RUNPOD_POD_ID ?? ""])
                    terminate.stdout.on('data', function (data) {
                        console.log('stdout: ' + data.toString());
                        log(data.toString());
                    });

                    terminate.stderr.on('data', function (data) {
                        console.log('stderr: ' + data.toString());
                        log(data.toString(), "\u001b[0;31m");
                    });

                    render.on('exit', function (code) {
                        log("Terminate command finished", undefined, true);
                    })
                }, 10e3)

                /*const apiKey = process.env.INTERNAL_API_KEY;
                if(apiKey) {
                    console.log("Terminating in 5 seconds");
                    setTimeout(() => {
                        fetch('https://rest.runpod.io/v1/pods/' + process.env.RUNPOD_POD_ID, {
                            method: 'DELETE',
                            headers: {
                                Authorization: 'Bearer ' + apiKey,
                                "user-agent": "BlenderCloudRender/1.0.0"
                            }
                        })
                            .then(async (response) => {
                                const text = await response.text();
                                if(response.ok) {
                                    console.log("Termination request succeeded! Goodbye.", text)
                                } else {
                                    console.warn("Termination request failed!", response.status, response.statusText, text);
                                }
                            })
                    }, 5e3);
                } else {
                    console.warn("No API key found. Unable to terminate this pod.");
                }*/
            }
        });
    }
})
