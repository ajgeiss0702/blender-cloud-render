import {exec, spawn} from 'child_process';
console.log("hello world!");
exec("wget https://pub-dd273e04901f409f8dbd9aee5b39ded6.r2.dev/dounut_small.blend", (error, stdout, stderr) => {
    if(error) console.log(error);
    // lines are filter to exclude all of the progress lines from spamming the logs
    console.log(stdout.split("\n").filter(l => !l.includes("..........")).join("\n").toString());
    console.log(stderr.toString());
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
                console.log("Done!")
            }
        });
    }
})