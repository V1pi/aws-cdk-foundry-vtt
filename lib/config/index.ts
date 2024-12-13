import * as fs from 'fs';
import * as path from 'path';

export const Config = {
    hasS3Options: () => {
        return fs.existsSync(Config.getS3OptionsPath());
    },
    getS3OptionsPath: () => {
        return path.join(__dirname, '..', '..', 'options.json');
    },
    containerS3OptionsPath: () => {
        return '/data/options.json';
    }
}