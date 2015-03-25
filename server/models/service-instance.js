var async = require('async');
var debug = require('debug')('strong-mesh-models:server:service-instance');

module.exports = function extendServiceInstance(ServiceInstance) {
  ServiceInstance.beforeRemote(
    'prototype.updateAttributes',
    function(ctx, _, next) {
      debug('updateAttributes with %j', ctx.args.data);
      // When updating the instance via REST, only allow changes to cpus
      ctx.args.data = {
        cpus: ctx.args.data.cpus
      };
      next();
    }
  );

  ServiceInstance.observe('before save', function beforeUpdate(ctx, next) {
    if (ctx.instance) {
      // create or full update of instance model
      if (isNaN(parseInt(ctx.instance.cpus, 10))) {
        ctx.instance.cpus = 'CPU';
      }
    } else if (ctx.data && ctx.data.cpus &&
      isNaN(parseInt(ctx.data.cpus, 10))) {
      ctx.data.cpus = 'CPU';
    }
    next();
  });

  // For save, the manager is notified after the model has  been persisted in
  // DB so that queries on the DB will return correct information. Similarly
  // for delete, the manager is notified before the model has been deleted from
  // the DB, so that queries will return information.
  ServiceInstance.observe('after save', function(ctx, next) {
    var serviceManager = ServiceInstance.app.serviceManager;
    if (ctx.instance) {
      // Full save of Instance (create)
      serviceManager.onInstanceUpdate(ctx.instance, next);
    } else {
      // Save of multiple Services
      ServiceInstance.find(ctx.where, function(err, services) {
        if (err) return next(err);
        return async.each(
          services,
          function(instance, callback) {
            serviceManager.onInstanceUpdate(instance, callback);
          },
          next
        );
      });
    }
  });

  ServiceInstance.observe('before delete', function(ctx, next) {
    var serviceManager = ServiceInstance.app.serviceManager;

    ctx.Model.find(ctx.where, function(err, instances) {
      if (err) next(err);
      return async.each(
        instances,
        function(instance, callback) {
          serviceManager.onInstanceDestroy(instance, callback);
        },
        next
      );
    });
  });

  function recordInstanceInfo(instanceId, instInfo, callback) {
    ServiceInstance.findById(instanceId, function(err, instance) {
      if (err) return callback(err);
      instance.currentDeploymentId = instInfo.commitHash;
      instance.startTime = new Date();
      instance.started = true;
      instance.applicationName = instInfo.appName;
      instance.npmModules = instInfo.npmModules;
      instance.PMPort = instInfo.PMPort;
      instance.containerVersionInfo = instInfo.containerVersionInfo;
      instance.setSize = instInfo.setSize;
      instance.agentVersion = instInfo.agentVersion;
      instance.restartCount = instInfo.restartCount;
      instance.save(callback);
    });
  }
  ServiceInstance.recordInstanceInfo = recordInstanceInfo;

  function runCommand(req, callback) {
    this.actions.create({
      request: req
    }, function(err, action) {
      if (err) return callback(err);
      if (action.result && action.result.error)
        return callback(Error(action.result.error));

      callback(null, action.result);
    });
  }
  ServiceInstance.prototype.runCommand = runCommand;

  function _appCommand(obj, callback) {
    obj.sub = obj.cmd;
    obj.cmd = 'current';
    this.runCommand(obj, callback);
  }
  ServiceInstance.prototype._appCommand = _appCommand;

  function _simpleCommand(cmd, callback) {
    this.runCommand({cmd: cmd}, callback);
  }
  ServiceInstance.prototype._simpleCommand = _simpleCommand;

  /**
   * Retrieve a summary status of the instance.
   * @param {function} callback Callback function.
   */
  function statusSummary(callback) {
    this.runCommand({cmd: 'status'}, callback);
  }
  ServiceInstance.prototype.statusSummary = statusSummary;

  /**
   * Start the application on the instance.
   *
   * @param {function} callback Callback function.
   */
  function start(callback) {
    this._simpleCommand('start', callback);
  }
  ServiceInstance.prototype.start = start;

  /**
   * Stop the application on the instance.
   *
   * "Soft" stop notify workers they are being disconnected, and give them a
   * grace period for any existing connections to finish. "Hard" stops kill the
   * supervisor and its workers with `SIGTERM`.
   *
   * @param {object} options Options object.
   * @param {boolean} options.soft Soft stop the application.
   * @param {function} callback Callback function.
   */
  function stop(options, callback) {
    if (options.soft)
      return this._simpleCommand('soft-stop', callback);
    return this._simpleCommand('stop', callback);
  }
  ServiceInstance.prototype.stop = stop;

  /**
   * Restart the application on the instance.
   *
   * "Soft" restart notifies all workers they are being disconnected, and give
   * them a grace period for any existing connections to finish. It then stops
   * all workers before starting them. "Hard" restart kill the supervisor and
   * its workers with `SIGTERM` and then starts them.
   *
   * "Rolling" restart is a zero-downtime restart, the workers are soft
   * restarted one-by-one, so that some workers will always be available to
   * service requests.
   *
   * @param {object} options Options object.
   * @param {boolean} options.soft Soft stop the application.
   * @param {boolean} options.rolling Soft stop the application.
   * @param {function} callback Callback function.
   */
  function restart(options, callback) {
    if (options.rolling)
      return this._appCommand({cmd: 'restart'}, callback);
    if (options.soft)
      return this._simpleCommand('soft-restart', callback);
    return this._simpleCommand('restart', callback);
  }
  ServiceInstance.prototype.restart = restart;

  /**
   * Set cluster size to N workers.
   *
   * @param {int|string} size The number of workers. Set to 'CPU' to start one
   * worker per CPU core available to the instance.
   * @param {boolean} persist Persist the cluster size across restarts.
   * @param {function} callback Callback function.
   */
  function setClusterSize(size, persist, callback) {
    var self = this;
    return this._appCommand({cmd: 'set-size', size: size},
      function(err, response) {
        if (err && !(persist && err.message === 'application not running')) {
          return callback(err);
        }
        if (persist) {
          return self.updateAttributes({cpus: size}, function(err) {
            callback(err, response);
          });
        }
        callback(null, response);
      }
    );
  }
  ServiceInstance.prototype.setClusterSize = setClusterSize;

  /**
   * List dependencies of the current application
   *
   * @param {function} callback Callback function.
   */
  function npmModuleList(callback) {
    return this._appCommand({cmd: 'npm-ls'}, callback);
  }
  ServiceInstance.prototype.npmModuleList = npmModuleList;

  /**
   * Set or unset environment of the current application.
   * This command will cause the application to restart.
   *
   * @param {object} env Object containing key and value of environment to set.
   * Using a value of null will cause the environment to be unset.
   * @param {function} callback Callback function.
   */
  function envSet(env, callback) {
    return this.runCommand({cmd: 'env-set', env: env}, callback);
  }
  ServiceInstance.prototype.envSet = envSet;

  /**
   * Get environment of the current application.
   *
   * @param {function} callback Callback function.
   */
  function envGet(callback) {
    return this._simpleCommand('env-get', callback);
  }
  ServiceInstance.prototype.envGet = envGet;

  function logDump(callback) {
    this._simpleCommand('log-dump', callback);
  }
  ServiceInstance.prototype.logDump = logDump;

  // Only allow updating ServiceInstance
  ServiceInstance.disableRemoteMethod('create', true);
  ServiceInstance.disableRemoteMethod('upsert', true);
  ServiceInstance.disableRemoteMethod('deleteById', true);
  ServiceInstance.disableRemoteMethod('deleteAll', true);
};
