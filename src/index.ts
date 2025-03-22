import {exec} from 'child_process';
console.log("hello world!");
exec("/usr/local/blender/blender -v", (err, stdout, stderr) => {
    if(err) console.log(err);
    console.log(stdout.toString());
    console.log(stderr.toString());
})