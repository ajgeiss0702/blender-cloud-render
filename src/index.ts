import {exec, spawn} from 'child_process';
import { NvidiaSMI } from "@quik-fe/node-nvidia-smi";

console.log("hello world!");

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
            if(code != 0) {
                console.log('child process exited with code ' + code?.toString());
            } else {
                console.log("Done!");

                const apiKey = process.env.INTERNAL_API_KEY;
                if(apiKey) {
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
                } else {
                    console.warn("No API key found. Unable to terminate this pod.");
                }
            }
        });
    }
})

function log(msg: string, color = ""): void {
    const url = process.env.DISCORD_LOG_WEBHOOK;
    if(!url) return;
    fetch(url, {
        method: "POST",
        body: JSON.stringify({
            content: "```ansi" + "\n" + color + msg + "\n```"
        }),
    }).then()
}