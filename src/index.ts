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

exec("wget https://pub-dd273e04901f409f8dbd9aee5b39ded6.r2.dev/dounut_small.blend", (error, stdout, stderr) => {
    if(error) console.log("error:", error);
    // lines are filter to exclude all of the progress lines from spamming the logs
    console.log(stdout.split("\n").filter(l => !l.includes("..........")).join("\n").toString());
    console.log(stderr.split("\n").filter(l => !l.includes("..........")).join("\n").toString());
    if(!error) {
        const render = spawn("/usr/local/blender/blender", "dounut_small.blend -b -f 160 -- --cycles-device OPTIX".split(" "));
        render.stdout.on('data', function (data) {
            console.log('stdout: ' + data.toString());
        });

        render.stderr.on('data', function (data) {
            console.log('stderr: ' + data.toString());
        });
        render.on('exit', function (code) {
            if(code != 0) {
                console.log('child process exited with code ' + code?.toString());
            } else {
                console.log("Done!");

                const apiKey = process.env.RUNPOD_API_KEY;
                console.log({apiKey, id: process.env.RUNPOD_POD_ID});
                if(apiKey) {
                    fetch('https://rest.runpod.io/v1/pods/' + process.env.RUNPOD_POD_ID + "/stop", {
                        method: 'POST',
                        headers: {
                            Authorization: 'Bearer ' + apiKey,
                        }
                    })
                        .then(async (response) => {
                            const text = await response.text();
                            if(response.ok) {
                                console.log("Stop request succeeded! Goodbye.", text)
                            } else {
                                console.warn("Stop request failed!", response.status, response.statusText, text);
                            }
                        })
                } else {
                    console.warn("No API key found. Unable to terminate this pod.");
                }
            }
        });
    }
})