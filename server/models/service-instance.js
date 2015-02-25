var async = require('async');
var debug = require('debug')('MeshModels.server.ServiceInstance');

module.exports = function(ServiceInstance) {
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

  ServiceInstance.observe('after save', function(ctx, next) {
    var serviceManager = ServiceInstance.app.serviceManager;
    if (ctx.instance) {
      // Full save of Instance (create)
      serviceManager.onInstanceUpdate(ctx.instance, next);
    } else {
      // Save of multiple Services
      ServiceInstance.find(ctx.where, function(err, services) {
        if (err) return next(err);
        async.each(
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
      async.each(
        instances,
        function(instance, callback) {
          serviceManager.onInstanceDestroy(instance, callback);
        },
        next
      );
    });
  });

  // Only allow updating ServiceInstance
  ServiceInstance.disableRemoteMethod('create', true);
  ServiceInstance.disableRemoteMethod('upsert', true);
  ServiceInstance.disableRemoteMethod('deleteById', true);
  ServiceInstance.disableRemoteMethod('deleteAll', true);
};
