import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { AppError } from '../errorHandler';
import logger from '../util/logger';

export class LivePhotoService {
    private tempDir: string;

    constructor(tempDir: string) {
        this.tempDir = tempDir;
    }

    async convertToAndroidMotionPhoto(jpegPath: string, movPath: string): Promise<Buffer> {
        try {
            const mp4Path = path.join(this.tempDir, `temp_${Date.now()}.mp4`);
            await this.convertMovToMp4(movPath, mp4Path);

            const jpegBuffer = await fs.readFile(jpegPath);
            const mp4Buffer = await fs.readFile(mp4Path);

            const motionPhoto = await this.embedMp4IntoJpeg(jpegBuffer, mp4Buffer);

            await fs.unlink(mp4Path);

            return motionPhoto;
        } catch (error) {
            logger.error('Failed to convert Live Photo to Android Motion Photo', { error });
            throw new AppError('Failed to convert Live Photo', 500);
        }
    }

    async convertToAppleLivePhoto(motionPhotoPath: string): Promise<{ jpeg: Buffer; mov: Buffer }> {
        try {
            const timestamp = Date.now();
            const jpegPath = path.join(this.tempDir, `temp_${timestamp}.jpg`);
            const mp4Path = path.join(this.tempDir, `temp_${timestamp}.mp4`);
            const movPath = path.join(this.tempDir, `temp_${timestamp}.mov`);

            await this.extractJpegAndMp4(motionPhotoPath, jpegPath, mp4Path);
            await this.convertMp4ToMov(mp4Path, movPath);

            const jpeg = await fs.readFile(jpegPath);
            const mov = await fs.readFile(movPath);

            await Promise.all([
                fs.unlink(jpegPath),
                fs.unlink(mp4Path),
                fs.unlink(movPath)
            ]);

            return { jpeg, mov };
        } catch (error) {
            logger.error('Failed to convert Android Motion Photo to Live Photo', { error });
            throw new AppError('Failed to convert Motion Photo', 500);
        }
    }

    private async convertMovToMp4(input: string, output: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg(input)
                .outputOptions('-c:v libx264', '-preset ultrafast', '-crf 22', '-c:a aac', '-b:a 128k')
                .output(output)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
    }

    private async convertMp4ToMov(input: string, output: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg(input)
                .outputOptions('-c:v prores_ks', '-profile:v 3', '-qscale:v 9', '-vendor apl0', '-c:a pcm_s16le')
                .output(output)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
    }

    private async extractJpegAndMp4(input: string, jpegOutput: string, mp4Output: string): Promise<void> {
        const buffer = await fs.readFile(input);
        const jpegEnd = buffer.indexOf(Buffer.from([0xFF, 0xD9])) + 2;

        await Promise.all([
            fs.writeFile(jpegOutput, buffer.slice(0, jpegEnd)),
            fs.writeFile(mp4Output, buffer.slice(jpegEnd))
        ]);
    }

    private async embedMp4IntoJpeg(jpegBuffer: Buffer, mp4Buffer: Buffer): Promise<Buffer> {
        const xmpMetadata = Buffer.from(
            `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
            <x:xmpmeta xmlns:x="adobe:ns:meta/">
              <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                <rdf:Description rdf:about=""
                    xmlns:GCamera="http://ns.google.com/photos/1.0/camera/">
                  <GCamera:MotionPhoto>1</GCamera:MotionPhoto>
                  <GCamera:MotionPhotoVersion>1</GCamera:MotionPhotoVersion>
                  <GCamera:MotionPhotoPresentationTimestampUs>0</GCamera:MotionPhotoPresentationTimestampUs>
                </rdf:Description>
              </rdf:RDF>
            </x:xmpmeta>
            <?xpacket end="w"?>`,
            'utf-8'
        );

        const exifEnd = jpegBuffer.indexOf(Buffer.from([0xFF, 0xE1])) + 2;
        return Buffer.concat([
            jpegBuffer.slice(0, exifEnd),
            xmpMetadata,
            jpegBuffer.slice(exifEnd),
            mp4Buffer
        ]);
    }
}