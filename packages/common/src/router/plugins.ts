import { TRPCError } from '@trpc/server'
import { internalProcedure, protectedProcedure, router } from './trpc'
import {
  dispatchPluginInputSchema,
  setPluginEnabledInputSchema,
  updatePluginConfigInputSchema,
  getPluginConfigInputSchema,
} from '../schemas'

const MASKED = '••••••'

export const pluginsRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    const manifests = ctx.pluginRegistry.list()
    return {
      plugins: manifests
        .map(manifest => {
          const state = ctx.pluginConfig.getState(manifest.id)
          const configured = manifest.adminConfigSchema
            .filter(f => f.required)
            .every(f => !!state.config[f.key])
          return { ...manifest, enabled: state.enabled, configured }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  }),

  setEnabled: protectedProcedure
    .input(setPluginEnabledInputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.pluginRegistry.get(input.pluginId)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Plugin '${input.pluginId}' not found` })
      }
      await ctx.pluginConfig.setEnabled(input.pluginId, input.enabled)
      await ctx.pluginConfig.writeSharedHelpers()
      return { ok: true as const }
    }),

  getConfig: protectedProcedure
    .input(getPluginConfigInputSchema)
    .query(({ input, ctx }) => {
      const plugin = ctx.pluginRegistry.get(input.pluginId)
      if (!plugin) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Plugin '${input.pluginId}' not found` })
      }
      const state = ctx.pluginConfig.getState(input.pluginId)
      const fields = plugin.manifest.adminConfigSchema.map(field => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        value: field.type === 'secret' && state.config[field.key]
          ? MASKED
          : (state.config[field.key] ?? ''),
      }))
      return { fields }
    }),

  updateConfig: protectedProcedure
    .input(updatePluginConfigInputSchema)
    .mutation(async ({ input, ctx }) => {
      const plugin = ctx.pluginRegistry.get(input.pluginId)
      if (!plugin) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Plugin '${input.pluginId}' not found` })
      }
      const filteredConfig: Record<string, string> = {}
      for (const [key, value] of Object.entries(input.config)) {
        if (value === MASKED) continue
        if (value === '') {
          const field = plugin.manifest.adminConfigSchema.find(f => f.key === key)
          if (field?.required) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Field '${field.label}' is required` })
          }
        }
        filteredConfig[key] = value
      }
      await ctx.pluginConfig.updateConfig(input.pluginId, filteredConfig)
      await ctx.pluginConfig.writeSharedHelpers()
      return { ok: true as const }
    }),

  dispatch: internalProcedure
    .input(dispatchPluginInputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.pluginRegistry.get(input.pluginId)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Plugin '${input.pluginId}' not found` })
      }
      await ctx.pluginRegistry.dispatch(input.pluginId, input.func, input.params)
      return { ok: true as const }
    }),
})
