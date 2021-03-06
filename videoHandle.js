/**
 * 处理视频流到bilibili直播上
 */
const ffmpeg = require('fluent-ffmpeg');
const _ = require('lodash');
const fs = require('fs');
const logger = require('./logger');
const waterMarkList = require('./config/waterMarkList');
const helper = require('./helper');

module.exports = {
    /**
     * 推流
     * @param  {String} chapter 推流文件
     * @param  {Object} liveInfo 直播信息
     * @return {Promise} 
     */
    pushStream : function(chapter,liveInfo) {
        let section = helper.getChapterFileName(chapter);
        let starttime = chapter.starttime ? chapter.starttime : 0;
        let duration = chapter.duration;
        console.log(section);
        return new Promise((reslove,reject) => {
            ffmpeg.ffprobe(`${__dirname}/data/${section}/${section}`, function(err, metadata) {
                if(err){
                    reject(err);
                }
                let stream = null;
                if(!_.isEmpty(metadata)){
                    stream = metadata.streams.find((value,index) => {
                        return value.codec_type === 'video';
                    });
                }

                if(!_.isEmpty(stream)){
                    if(stream.width/stream.height > 1.3 && stream.width/stream.height < 1.4)    reslove('4:3');
                    else if(stream.width/stream.height > 1.7 && stream.width/stream.height < 1.8)   reslove('16:9');
                    else    reject(new Error('此视频暂时无法解析'));
                }
                else{
                    reject(new Error('没有找到视频'));
                }
            });
        }).then((aspect) => {
            return new Promise((reslove ,reject) => {
            //判断是否需要添加字幕
            let hasSubtitles = fs.existsSync(`${__dirname}/data/${section}/sc.ass`);

            let inputPath = `${__dirname}/data/${section}/${section}`;
            let outputPath = `${liveInfo.rtmpUrl}/${liveInfo.rtmpCode}`;

            let videoW = null;
            let videoH = null;
            let screenW = null;
            let screenH = null;
            if(aspect === '4:3'){
                videoW = 640;
                videoH = 480;
                screenW = 800;
                screenH = 480;
            }else if(aspect === '16:9'){
                videoW = 1024;
                videoH = 600;
                screenW = 1024;
                screenH = 600;
            }

            let x = (screenW - videoW)/2;

            let filterList = [
                {
                    filter: 'scale',
                    options: {
                        width : videoW,
                        height : videoH
                    },
                    inputs: ['0:v'],
                    outputs: ['c']
                },
                {
                    filter: 'pad',
                    options: {
                        width :screenW,
                        height : screenH,
                        x : x
                    },
                    inputs: ['c'],
                    outputs: ['output']
                }
            ];

            //添加字幕
            if(hasSubtitles){
                filterList.push({
                    filter: 'subtitles',
                    options: {
                        filename : `${__dirname}/data/${section}/sc.ass`,
                    },
                    inputs: ['output'],
                    outputs: ['output']
                });
            }

            filterList = filterList.concat(waterMarkList(chapter));

            var cmd = ffmpeg(inputPath);
            if(duration)    cmd.duration(duration);

            
            cmd.seekInput(starttime)
                .inputOptions('-re')
                .inputOptions('-ac 2')
                .complexFilter(filterList)
                .on('start', function(commandLine) {
                    logger.info(`开始串流:${outputPath}`);
                })
                .on('error', function(err, stdout, stderr) {
                    logger.error('error: ' + err.message);
                    logger.error('stdout: ' + stdout);
                    logger.error('stderr: ' + stderr);
                    reject(err);
                })
                .on('end', function() {
                    logger.info('当前视频串流完成 !');
                    reslove();
                })
                .addOptions([
                    '-vcodec libx264',
                    '-preset veryfast',
                    '-crf 22',
                    '-maxrate 1000k',
                    '-bufsize 3000k',
                    '-acodec libmp3lame',
                    '-ac 2',
                    '-ar 44100'
                ])
                .format('flv')
                .output(outputPath,{end:false}).run();
            });
        });
        
    }
};


    