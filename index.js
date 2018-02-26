var async = require('async');
var AWS = require('aws-sdk');
var path = require('path');
var gm = require('gm').subClass({ imageMagick: true });

var sizesArray = ["thumbnail$24x24","profile$100x100","full$400x400","badge$300x200"];
exports.handler = function(event, context) {
    sizesArray.forEach(function(currentSize) {
        var maxWidth;
        var maxHeight;
        var suffix;
        var splitElement;
        var splitSizes;
        var s3;

        splitElement = currentSize.split("$");
        splitSizes = splitElement[1].split("x");

        maxWidth = splitSizes[0];
        maxHeight = splitSizes[1];
        suffix = splitElement[0];

        s3 = new AWS.S3();

        var srcBucket = event.Records[0].s3.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        var srcKey = decodeURIComponent(
        event.Records[0].s3.object.key.replace(/\+/g, " ")
        );

        //after removing the spaces, get file dir, and update the fileName
        var dstBucket = "modified-bucket-eshow-dev";  //destination bucket var dstBucket = srcBucket + "-resized"; hard coded for meow
        
        var splitKey = srcKey.split(".");
        var splitPath = splitKey[0].split("/");
        var splitFileName = splitPath[splitPath.length - 1];
        var dstKey = splitFileName + "_" + suffix + "." + splitKey[1];     //destination key


        //get number of the folder
        var numberOfFolder = srcKey.split("/").length - 1;
        if(numberOfFolder > 0)
        {
            var pathName = path.dirname(srcKey);
            //var fileName = path.basename(srcKey);
            var newFileName  = dstKey;
            dstKey =  path.join(pathName, newFileName);
        }

        // Sanity check: validate that source and destination are different buckets.
        if (srcBucket == dstBucket) {
            console.log("Same Bucket Record Skipped: " + srcBucket + " " + dstBucket);
            return;
        }

        var imageType = splitKey[1];
        if (imageType != "jpg" && imageType != "jpeg" && imageType != "png" && imageType != "gif") {
            console.log("Invalid Image Type: " + imageType);
            return;
        }

        var extType = path.extname(srcKey);
        
        /*
        Debugging
        console.log("Type of File: ", extType );
        */

        // Download the image from S3, transform
        //and upload to a different S3 bucket.
        async.waterfall([
            function download(next) {
                // Download the image from S3 into a buffer.
                s3.getObject({
                        Bucket: srcBucket,
                        Key: srcKey
                    },
                    next);
                },
            function transform(response, next) {
                gm(response.Body).size(function(err, size) {
                    var scalingFactor = Math.min(
                        maxWidth / size.width,
                        maxHeight / size.height
                    );
                    var width  = scalingFactor * size.width;
                    var height = scalingFactor * size.height;
                    
                    /*
                    Debugging
                    console.log("Width: " + width + " Height: " + height + " Scaling Factor: " + scalingFactor + " maxWidth: " + maxWidth + " maxHeight: " + maxHeight
                                + "size.Width: " + size.width + " size.Height: " + size.height);
                    */

                    // Transform the image buffer in memory.
                    this.resize(width, height, "!")
                        .toBuffer(imageType, function(err, buffer) {
                            if (err) {
                                next(err);
                            } else {
                                next(null, response.ContentType, buffer);
                            }
                        });
                });
            },
            function upload(contentType, data, next) {
                // Stream the transformed image to a different S3 bucket.
                s3.putObject({
                        Bucket: dstBucket,
                        Key: dstKey,
                        Body: data,
                        ContentType: contentType
                    },
                    next);
                }
            ], function (err) {
                if (err) {
                    console.log(
                        'Unable to resize ' + srcBucket + '/' + srcKey +
                        ' and upload to ' + dstBucket + '/' + dstKey +
                        ' due to an error: ' + err
                    );
                } else {
                    console.log(
                        'Successfully resized ' + srcBucket + '/' + srcKey +
                        ' and uploaded to ' + dstBucket + '/' + dstKey
                    );
                }
            }
        );
    });
};
