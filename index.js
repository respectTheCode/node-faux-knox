var fs = require("fs");
var async = require("async");
var utils = require(__dirname + "/utils");
var join = require("path").join;
var relative = require("path").relative;

var Client = module.exports = function (config) {
	config = this.config = config || {};

	if (!config.bucket) {
		config.bucket = "./";
	} else {
		if (config.bucket[config.bucket.length - 1] !== "/") {
			config.bucket = config.bucket + "/";
		}
	}
};

Client.prototype.getFile = function (uri, headers, callback) {
	var self = this;

	if (!callback && typeof(headers) == "function") {
		callback = headers;
		headers = {};
	}
	var stream = fs.createReadStream(self.config.bucket + uri);
	function cancelLocalListeners() {
		stream.removeListener("error", bad);
		stream.removeListener("readable", good);
	}
	function bad(e) {
		cancelLocalListeners();
		if (e.code === "ENOENT") {
			stream.statusCode = 404;
			stream.headers = {};
			return callback(null, stream);
		}
	}
	function good() {
		stream.headers = {};
		stream.statusCode = 200;
		cancelLocalListeners();
		return callback(null, stream);
	}
	stream.on("error", bad);
	stream.on("readable", good);
};

Client.prototype.putFile = function (from, to, headers, callback) {
	var self = this;

	if (typeof(callback) == "undefined") {
		callback = headers;
	}

	async.series([function (cb) {
		utils.checkToPath(self.config.bucket + to, cb);
	}, function (cb) {
		fs.stat(from, cb);
	}], function (err) {
		if (err) {
			return callback(err);
		}
		var r = fs.createReadStream(from);
		var w = fs.createWriteStream(self.config.bucket + to);

		w.on("finish", function () {
			callback(null, {headers:{}, statusCode:200});
		});
		w.on("error", function (e) {
			callback(null, {headers:{}, statusCode:404});
		});
		r.pipe(w);
	});
};

Client.prototype.putBuffer = function (buffer, to, headers, callback) {
	var self = this;

	utils.checkToPath(self.config.bucket + to, function () {
		fs.writeFile(self.config.bucket + to, buffer, function (err) {
			if (err) {
				return callback(err);
			}

			return callback(null, {headers:{}, statusCode:200});
		});
	});
};

Client.prototype.deleteFile = function (file, callback) {
	var self = this;

	fs.unlink(self.config.bucket + file, function (err) {
		return callback(null, {headers:{}, statusCode: err ? 404 : 204});
	});
};

Client.prototype.copyFile = function (from, to, callback) {
	var self = this;

	utils.checkToPath(self.config.bucket + to, function () {
		var readStream = fs.createReadStream(self.config.bucket + from);
		var writeStream = fs.createWriteStream(self.config.bucket + to);
		var isDone = false;
		var done = function (err) {
			if (isDone) return;
			isDone = true;

			if (err) {
				return callback(err);
			}

			return callback(null, {headers:{}, statusCode:200});
		};

		readStream.on("error", done);
		writeStream.on("error", done);
		writeStream.on("close", function () {
			done();
		});
		readStream.pipe(writeStream);
	});
};

Client.prototype.list = function (options, cb) {
	var self = this;
	var baseDirectory = self.config.bucket + (options.prefix || '/');
	utils.checkToPath(baseDirectory, function() {
		var walk = require("walk");
		var walker = walk.walk(baseDirectory);
		var files = [];

		walker.on("file", function (root, stat, next) {
			files.push({
				Key: join(relative(self.config.bucket, root), stat.name),
				Size: stat.size,
				LastModified: stat.mtime
			});
			next();
		});

		walker.on("end", function () {
			cb(null, {Contents: files});
		});
	});
};

module.exports.createClient = function (config) {
	return new Client(config);
};
