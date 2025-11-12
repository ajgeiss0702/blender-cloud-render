import {exec, spawn} from 'child_process';
import { NvidiaSMI } from "@quik-fe/node-nvidia-smi";
import {promises as fs} from "fs";
import {wait} from "./utils";

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
        const gpuInfos = await NvidiaSMI.Utils.get_gpus();
        const memoryUsage = await NvidiaSMI.Utils.getMemoryUsage();
        const cudaVersion = await NvidiaSMI.Utils.getCudaVersion();
        const url = process.env.DISCORD_LOG_WEBHOOK;
        console.log({
            cudaVersion,
            gpuInfos,
            memoryUsage,
        })
        if(url) {
            const formData = new FormData();
            formData.append(
                "files[0]",
                new Blob(
                    [JSON.stringify({cudaVersion, gpuInfos, memoryUsage}, undefined, '\t')],
                    {type: 'application/json'}
                ),
                "items.json"
            );
            await fetch(url, {
                method: "POST",
                body: formData,
            }).then(async r => {
                if(!r.ok) {
                    console.warn("Non-ok when sending nvidia-smi webhook:", r.status, r.statusText, await r.text());
                }
            })
        }
    } else {
        console.warn("Missing NvidiaSMI")
        log("Missing NvidiaSMI");
    }
})();

const fileUrl = process.env.BLEND_FILE_URL ?? ("https://pub-dd273e04901f409f8dbd9aee5b39ded6.r2.dev/" + (process.env.BLEND_FILE_NAME ?? "dounut_small.blend"));
const uploadKey = process.env.UPLOAD_KEY;
const jobId = process.env.JOB_ID;
const jobType = process.env.JOB_TYPE ?? "160";

const fileName = fileUrl.split("/")
    .find(s => s.toLowerCase().includes(".blend"))
    ?.split("?")[0];

if(!fileName) {
    console.error("Could not get file name from", fileUrl)
    process.exit(1);
}

log("hello world!");

let frameUploadPromises: Promise<unknown>[] = [];

exec("wget '" + encodeURI(fileUrl) + "' -O " + fileName, (error, stdout, stderr) => {
    if(error) console.log("error:", error);
    // lines are filter to exclude all of the progress lines from spamming the logs
    console.log(stdout.split("\n").filter(l => !l.includes("..........")).join("\n").toString());
    console.log(stderr.split("\n").filter(l => !l.includes("..........")).join("\n").toString());
    if(!error) {
        const args = [
            fileName,
            ...("-b -o //out/frame- " + (jobType === "animation" ? "-a" : "-f " + jobType) + " -- --cycles-device OPTIX").split(" ")
        ]
        const render = spawn("/usr/local/blender/blender", args);
        render.stdout.on('data', function (data) {
            const line: string = data.toString();
            console.log('stdout: ' + line);
            log(line);
            if(line.startsWith("Saved: '") && jobId && uploadKey) {
                const filePath = line.split("'")[1];
                const fileName = filePath.split("/").reduce((_, c) => c);
                const frameNumber = fileName.split("frame-")[1].split(".")[0];
                frameUploadPromises.push((async () => {

                    const searchParams = new URLSearchParams();
                    searchParams.set("jobId", jobId);
                    searchParams.set("uploadKey", uploadKey);

                    const formData = new FormData();
                    formData.set("output", new Blob([await fs.readFile(filePath)]), fileName);
                    formData.set("frameNumber", frameNumber);

                    const go = () =>
                        fetch("https://blender-cloud-render-dashboard.pages.dev/job-upload?" + searchParams, {
                            method: "POST",
                            headers: {
                                Origin: "https://blender-cloud-render-dashboard.pages.dev"
                            },
                            body: formData
                        }).catch(e => {
                            console.warn(e);
                            log("Failed to upload frame: " + e, "\u001b[0;31m");
                            return false;
                        });

                    for (let i = 0; i < 3; i++) {
                        const r = await go();
                        if(typeof r !== "boolean" && r.ok) break;
                        if(typeof r !== "boolean") log("Failed to upload frame: " + r.status + " " + r.statusText + " " + await r.text());
                        await wait(Math.pow(2, (i+1)) * 1e3);
                    }
                })());
            }
        });

        render.stderr.on('data', function (data) {
            console.log('stderr: ' + data.toString());
            log(data.toString(), "\u001b[0;31m");
        });
        render.on('exit', async function (code) {
            await Promise.all(frameUploadPromises)



            log(undefined, undefined, true);
            if(code != 0) {
                log('render process exited with code ' + code?.toString());
            } else {
                log("Done!");
            }

            if(jobId && uploadKey) {
                const searchParams = new URLSearchParams();
                searchParams.set("jobId", jobId);
                searchParams.set("uploadKey", uploadKey);
                searchParams.set("code", code+"");
                const doneUpdate = await fetch("https://blender-cloud-render-dashboard.pages.dev/job-finished?" + searchParams, {
                    method: "POST"
                });
                if(doneUpdate.ok) {
                    console.log("Job marked as done!");
                } else {
                    console.warn("Failed to mark job as done!", doneUpdate.status, doneUpdate.statusText, await doneUpdate.text());
                    await wait(5e3);
                }
            }

            /*console.log("Everything is done. Attempting runpodctl terminate in 10 seconds");
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
            }, 10e3);*/
        });
    }
})


// So the process doesn't exit. If the process exits, it gets restarted. We don't want that.
setInterval(() => {}, 1 << 30);