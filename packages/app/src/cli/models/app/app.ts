import {AppErrors, isWebType} from './loader.js'
import {ExtensionInstance} from '../extensions/extension-instance.js'
import {isType} from '../../utilities/types.js'
import {zod} from '@shopify/cli-kit/node/schema'
import {DotEnvFile} from '@shopify/cli-kit/node/dot-env'
import {getDependencies, PackageManager, readAndParsePackageJson} from '@shopify/cli-kit/node/node-package-manager'
import {fileRealPath, findPathUp} from '@shopify/cli-kit/node/fs'
import {joinPath} from '@shopify/cli-kit/node/path'

export const LegacyAppSchema = zod
  .object({
    client_id: zod.number().optional(),
    name: zod.string().optional(),
    scopes: zod.string().default(''),
    extension_directories: zod.array(zod.string()).optional(),
    web_directories: zod.array(zod.string()).optional(),
  })
  .strict()

// adding http or https presence and absence of new lines to url validation
const validateUrl = (zodType: zod.ZodString) => {
  return zodType
    .url()
    .refine((value) => Boolean(value.match(/^(https?:\/\/)/)), {message: 'Invalid url'})
    .refine((value) => !value.includes('\n'), {message: 'Invalid url'})
}

export const AppSchema = zod
  .object({
    name: zod.string().max(30),
    client_id: zod.string(),
    application_url: validateUrl(zod.string()),
    embedded: zod.boolean(),
    access_scopes: zod
      .object({
        scopes: zod.string().optional(),
        use_legacy_install_flow: zod.boolean().optional(),
      })
      .optional(),
    auth: zod
      .object({
        redirect_urls: zod.array(validateUrl(zod.string())),
      })
      .optional(),
    webhooks: zod.object({
      api_version: zod.string(),
      privacy_compliance: zod
        .object({
          customer_deletion_url: validateUrl(zod.string()).optional(),
          customer_data_request_url: validateUrl(zod.string()).optional(),
          shop_deletion_url: validateUrl(zod.string()).optional(),
        })
        .optional(),
    }),
    app_proxy: zod
      .object({
        url: validateUrl(zod.string()),
        subpath: zod.string(),
        prefix: zod.string(),
      })
      .optional(),
    pos: zod
      .object({
        embedded: zod.boolean(),
      })
      .optional(),
    app_preferences: zod
      .object({
        url: validateUrl(zod.string().max(255)),
      })
      .optional(),
    build: zod
      .object({
        automatically_update_urls_on_dev: zod.boolean().optional(),
        dev_store_url: zod.string().optional(),
      })
      .optional(),
    extension_directories: zod.array(zod.string()).optional(),
    web_directories: zod.array(zod.string()).optional(),
  })
  .strict()

export const AppConfigurationSchema = zod.union([LegacyAppSchema, AppSchema])

/**
 * Check whether a shopify.app.toml schema is valid against the legacy schema definition.
 * @param item - the item to validate
 */
export function isLegacyAppSchema(item: AppConfiguration): item is LegacyAppConfiguration {
  const {path, ...rest} = item
  return isType(LegacyAppSchema, rest)
}

/**
 * Check whether a shopify.app.toml schema is valid against the current schema definition.
 * @param item - the item to validate
 */
export function isCurrentAppSchema(item: AppConfiguration): item is CurrentAppConfiguration {
  const {path, ...rest} = item
  return isType(AppSchema, rest)
}

/**
 * Get scopes from a given app.toml config file.
 * @param config - a configuration file
 */
export function getAppScopes(config: AppConfiguration) {
  if (isLegacyAppSchema(config)) {
    return config.scopes
  } else {
    return config.access_scopes?.scopes ?? ''
  }
}

/**
 * Get scopes as an array from a given app.toml config file.
 * @param config - a configuration file
 */
export function getAppScopesArray(config: AppConfiguration) {
  const scopes = getAppScopes(config)
  return scopes.length ? scopes.split(',').map((scope) => scope.trim()) : []
}

export function usesLegacyScopesBehavior(config: AppConfiguration) {
  if (isLegacyAppSchema(config)) return true
  return Boolean(config.access_scopes?.use_legacy_install_flow)
}

export function appIsLaunchable(app: AppInterface) {
  const frontendConfig = app?.webs?.find((web) => isWebType(web, WebType.Frontend))
  const backendConfig = app?.webs?.find((web) => isWebType(web, WebType.Backend))

  return Boolean(frontendConfig || backendConfig)
}

export enum WebType {
  Frontend = 'frontend',
  Backend = 'backend',
  Background = 'background',
}

const ensurePathStartsWithSlash = (arg: unknown) => (typeof arg === 'string' && !arg.startsWith('/') ? `/${arg}` : arg)

const WebConfigurationAuthCallbackPathSchema = zod.preprocess(ensurePathStartsWithSlash, zod.string())

const baseWebConfigurationSchema = zod.object({
  auth_callback_path: zod
    .union([WebConfigurationAuthCallbackPathSchema, WebConfigurationAuthCallbackPathSchema.array()])
    .optional(),
  webhooks_path: zod.preprocess(ensurePathStartsWithSlash, zod.string()).optional(),
  port: zod.number().max(65536).min(0).optional(),
  commands: zod.object({
    build: zod.string().optional(),
    dev: zod.string(),
  }),
  name: zod.string().optional(),
  hmr_server: zod.object({http_paths: zod.string().array()}).optional(),
})
const webTypes = zod.enum([WebType.Frontend, WebType.Backend, WebType.Background]).default(WebType.Frontend)
export const WebConfigurationSchema = zod.union([
  baseWebConfigurationSchema.extend({roles: zod.array(webTypes)}),
  baseWebConfigurationSchema.extend({type: webTypes}),
])
export const ProcessedWebConfigurationSchema = baseWebConfigurationSchema.extend({roles: zod.array(webTypes)})

export type AppConfiguration = zod.infer<typeof AppConfigurationSchema> & {path: string}
export type CurrentAppConfiguration = zod.infer<typeof AppSchema> & {path: string}
export type LegacyAppConfiguration = zod.infer<typeof LegacyAppSchema> & {path: string}
export type WebConfiguration = zod.infer<typeof WebConfigurationSchema>
export type ProcessedWebConfiguration = zod.infer<typeof ProcessedWebConfigurationSchema>
export type WebConfigurationCommands = keyof WebConfiguration['commands']

export interface Web {
  directory: string
  configuration: ProcessedWebConfiguration
  framework?: string
}

export interface AppConfigurationInterface {
  directory: string
  configuration: AppConfiguration
}

export interface AppInterface extends AppConfigurationInterface {
  name: string
  idEnvironmentVariableName: string
  packageManager: PackageManager
  nodeDependencies: {[key: string]: string}
  webs: Web[]
  usesWorkspaces: boolean
  dotenv?: DotEnvFile
  allExtensions: ExtensionInstance[]
  errors?: AppErrors
  hasExtensions: () => boolean
  updateDependencies: () => Promise<void>
  extensionsForType: (spec: {identifier: string; externalIdentifier: string}) => ExtensionInstance[]
}

export class App implements AppInterface {
  name: string
  idEnvironmentVariableName: string
  directory: string
  packageManager: PackageManager
  configuration: AppConfiguration
  nodeDependencies: {[key: string]: string}
  webs: Web[]
  usesWorkspaces: boolean
  dotenv?: DotEnvFile
  errors?: AppErrors
  allExtensions: ExtensionInstance[]

  // eslint-disable-next-line max-params
  constructor(
    name: string,
    idEnvironmentVariableName: string,
    directory: string,
    packageManager: PackageManager,
    configuration: AppConfiguration,
    nodeDependencies: {[key: string]: string},
    webs: Web[],
    extensions: ExtensionInstance[],
    usesWorkspaces: boolean,
    dotenv?: DotEnvFile,
    errors?: AppErrors,
  ) {
    this.name = name
    this.idEnvironmentVariableName = idEnvironmentVariableName
    this.directory = directory
    this.packageManager = packageManager
    this.configuration = configuration
    this.nodeDependencies = nodeDependencies
    this.webs = webs
    this.dotenv = dotenv
    this.allExtensions = extensions
    this.errors = errors
    this.usesWorkspaces = usesWorkspaces
  }

  async updateDependencies() {
    const nodeDependencies = await getDependencies(joinPath(this.directory, 'package.json'))
    this.nodeDependencies = nodeDependencies
  }

  hasExtensions(): boolean {
    return this.allExtensions.length > 0
  }

  extensionsForType(specification: {identifier: string; externalIdentifier: string}): ExtensionInstance[] {
    return this.allExtensions.filter(
      (extension) => extension.type === specification.identifier || extension.type === specification.externalIdentifier,
    )
  }
}

export class EmptyApp extends App {
  constructor() {
    const configuration = {scopes: '', extension_directories: [], path: ''}
    super('', '', '', 'npm', configuration, {}, [], [], false)
  }
}

type RendererVersionResult = {name: string; version: string} | undefined | 'not_found'

/**
 * Given a UI extension, it returns the version of the renderer package.
 * Looks for `/node_modules/@shopify/{renderer-package-name}/package.json` to find the real version used.
 * @param extension - UI extension whose renderer version will be obtained.
 * @returns The version if the dependency exists.
 */
export async function getUIExtensionRendererVersion(extension: ExtensionInstance): Promise<RendererVersionResult> {
  // Look for the vanilla JS version of the dependency (the react one depends on it, will always be present)
  const rendererDependency = extension.dependency
  if (!rendererDependency) return undefined
  return getDependencyVersion(rendererDependency, extension.directory)
}

export async function getDependencyVersion(dependency: string, directory: string): Promise<RendererVersionResult> {
  // Split the dependency name to avoid using "/" in windows. Only look for non react dependencies.
  const dependencyName = dependency.replace('-react', '').split('/')
  const pattern = joinPath('node_modules', dependencyName[0]!, dependencyName[1]!, 'package.json')

  let packagePath = await findPathUp(pattern, {
    cwd: directory,
    type: 'file',
    allowSymlinks: true,
  })
  if (!packagePath) return 'not_found'
  packagePath = await fileRealPath(packagePath)

  // Load the package.json and extract the version
  const packageContent = await readAndParsePackageJson(packagePath)
  if (!packageContent.version) return 'not_found'
  return {name: dependency, version: packageContent.version}
}
