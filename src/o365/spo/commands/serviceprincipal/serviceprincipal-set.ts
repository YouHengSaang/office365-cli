import auth from '../../SpoAuth';
import { ContextInfo, ClientSvcResponse, ClientSvcResponseContents } from '../../spo';
import config from '../../../../config';
import * as request from 'request-promise-native';
import commands from '../../commands';
import GlobalOptions from '../../../../GlobalOptions';
import {
  CommandOption,
  CommandValidate,
  CommandError
} from '../../../../Command';
import SpoCommand from '../../SpoCommand';
import Utils from '../../../../Utils';

const vorpal: Vorpal = require('../../../../vorpal-init');

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  enabled: string;
  confirm?: boolean;
}

class SpoServicePrincipalSetCommand extends SpoCommand {
  public get name(): string {
    return commands.SERVICEPRINCIPAL_SET;
  }

  public get description(): string {
    return 'Enable or disable the service principal';
  }

  public getTelemetryProperties(args: CommandArgs): any {
    const telemetryProps: any = super.getTelemetryProperties(args);
    telemetryProps.enabled = args.options.enabled === 'true';
    return telemetryProps;
  }

  public alias(): string[] | undefined {
    return [commands.SP_SET];
  }

  protected requiresTenantAdmin(): boolean {
    return true;
  }

  public commandAction(cmd: CommandInstance, args: CommandArgs, cb: () => void): void {
    const enabled: boolean = args.options.enabled === 'true';

    const toggleServicePrincipal: () => void = (): void => {
      auth
        .ensureAccessToken(auth.service.resource, cmd, this.debug)
        .then((accessToken: string): request.RequestPromise => {
          if (this.debug) {
            cmd.log(`Retrieved access token ${accessToken}. Getting request digest...`);
          }

          return this.getRequestDigest(cmd, this.debug);
        })
        .then((res: ContextInfo): request.RequestPromise => {
          if (this.debug) {
            cmd.log('Response:');
            cmd.log(res);
            cmd.log('');
          }

          if (this.verbose) {
            cmd.log(`${(enabled ? 'Enabling' : 'Disabling')} service principal...`);
          }

          const requestOptions: any = {
            url: `${auth.site.url}/_vti_bin/client.svc/ProcessQuery`,
            headers: Utils.getRequestHeaders({
              authorization: `Bearer ${auth.service.accessToken}`,
              'X-RequestDigest': res.FormDigestValue
            }),
            body: `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="${config.applicationName}" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="28" ObjectPathId="27" /><SetProperty Id="29" ObjectPathId="27" Name="AccountEnabled"><Parameter Type="Boolean">${enabled}</Parameter></SetProperty><Method Name="Update" Id="30" ObjectPathId="27" /><Query Id="31" ObjectPathId="27"><Query SelectAllProperties="true"><Properties><Property Name="AccountEnabled" ScalarProperty="true" /></Properties></Query></Query></Actions><ObjectPaths><Constructor Id="27" TypeId="{104e8f06-1e00-4675-99c6-1b9b504ed8d8}" /></ObjectPaths></Request>`
          };

          if (this.debug) {
            cmd.log('Executing web request...');
            cmd.log(requestOptions);
            cmd.log('');
          }

          return request.post(requestOptions);
        })
        .then((res: string): void => {
          if (this.debug) {
            cmd.log('Response:');
            cmd.log(res);
            cmd.log('');
          }

          const json: ClientSvcResponse = JSON.parse(res);
          const response: ClientSvcResponseContents = json[0];
          if (response.ErrorInfo) {
            cmd.log(new CommandError(response.ErrorInfo.ErrorMessage));
          }
          else {
            const output: any = json[json.length - 1];
            delete output._ObjectType_;

            cmd.log(output);

            if (this.verbose) {
              cmd.log(vorpal.chalk.green('DONE'));
            }
          }
          cb();
        }, (err: any): void => this.handleRejectedPromise(err, cmd, cb));
    }

    if (args.options.confirm) {
      toggleServicePrincipal();
    }
    else {
      cmd.prompt({
        type: 'confirm',
        name: 'continue',
        default: false,
        message: `Are you sure you want to ${enabled ? 'enable' : 'disable'} the service principal?`,
      }, (result: { continue: boolean }): void => {
        if (!result.continue) {
          cb();
        }
        else {
          toggleServicePrincipal();
        }
      });
    }
  }

  public validate(): CommandValidate {
    return (args: CommandArgs): boolean | string => {
      if (!args.options.enabled) {
        return 'Required option enabled missing';
      }

      const enabled: string = args.options.enabled.toLowerCase();
      if (enabled !== 'true' &&
        enabled !== 'false') {
        return `${args.options.enabled} is not a valid boolean value. Allowed values are true|false`;
      }

      return true;
    };
  }

  public options(): CommandOption[] {
    const options: CommandOption[] = [
      {
        option: '-e, --enabled <enabled>',
        description: 'Set to true to enable the service principal or to false to disable it. Valid values are true|false',
        autocomplete: ['true', 'false']
      },
      {
        option: '--confirm',
        description: 'Don\'t prompt for confirming enabling/disabling the service principal'
      }
    ];

    const parentOptions: CommandOption[] = super.options();
    return options.concat(parentOptions);
  }

  public commandHelp(args: CommandArgs, log: (help: string) => void): void {
    const chalk = vorpal.chalk;
    log(vorpal.find(commands.SERVICEPRINCIPAL_SET).helpInformation());
    log(
      `  ${chalk.yellow('Important:')} before using this command, connect to a SharePoint Online tenant admin site,
  using the ${chalk.blue(commands.CONNECT)} command.
        
  Remarks:

    To enable or disable the service principal, you have to first connect to a tenant admin site using the
    ${chalk.blue(commands.CONNECT)} command, eg. ${chalk.grey(`${config.delimiter} ${commands.CONNECT} https://contoso-admin.sharepoint.com`)}.

    Using the ${chalk.blue('-e, --enabled')} option you can specify whether the service principal should be
    enabled or disabled. Use ${chalk.grey('true')} to enable the service principal and ${chalk.grey('false')} to
    disable it.

  Examples:
  
    Enable the service principal. Will prompt for confirmation
      ${chalk.grey(config.delimiter)} ${commands.SERVICEPRINCIPAL_SET} --enabled true

    Disable the service principal. Will prompt for confirmation
      ${chalk.grey(config.delimiter)} ${commands.SERVICEPRINCIPAL_SET} --enabled false

    Enable the service principal without prompting for confirmation
      ${chalk.grey(config.delimiter)} ${commands.SERVICEPRINCIPAL_SET} --enabled true --confirm
`);
  }
}

module.exports = new SpoServicePrincipalSetCommand();