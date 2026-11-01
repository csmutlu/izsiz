// Ortak temizleme çekirdeği (../core) masaüstü uygulamasıyla paylaşılıyor.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const core = path.resolve(__dirname, '../core');
config.watchFolders = [core];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(core, 'node_modules')];
module.exports = config;
