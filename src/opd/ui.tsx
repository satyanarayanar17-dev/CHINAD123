import { useEffect, useId, useRef, useState } from "react";
import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useForm } from "react-hook-form";
import { createPortal } from "react-dom";
import { z } from "zod";
import {
  AlertCircle,
  X,
  Inbox,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";
import { api, LogoutPendingError } from "../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "./i18n";
export const get = <T,>(path: string) =>
  api.get<T>(`/opd${path}`).then((r) => r.data);
export const post = <T,>(path: string, data: unknown = {}) =>
  api.post<T>(`/opd${path}`, data).then((r) => r.data);
export function errorCode(error: unknown) {
  if (error instanceof LogoutPendingError) return error.code;
  const e = error as {
    response?: { data?: { error?: { code?: string; message?: string } } };
    message?: string;
  };
  return (
    e.response?.data?.error?.code ||
    (!e.response ? "NETWORK_ERROR" : "GENERIC_ERROR")
  );
}
export function useAction() {
  const query = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  return {
    pending,
    error,
    success,
    setError,
    run: async <T,>(fn: () => Promise<T>, after?: (data: T) => void) => {
      setPending(true);
      setError("");
      setSuccess(false);
      try {
        const result = await fn();
        await query.invalidateQueries({ queryKey: ["opd"] });
        setSuccess(true);
        after?.(result);
        return result;
      } catch (e) {
        const code = errorCode(e);
        setError(code);
        if (code === "STALE_STATE" || code === "TASK_NO_LONGER_ACTIVE")
          await query.invalidateQueries({ queryKey: ["opd"] });
        return undefined;
      } finally {
        setPending(false);
      }
    },
  };
}
export function Alert({ code }: { code?: string }) {
  const { t } = useI18n();
  if (!code) return null;
  return (
    <div className="alert error" role="alert">
      <AlertCircle size={18} />
      <span>{t(code)}</span>
    </div>
  );
}
export function Success({ show }: { show?: boolean }) {
  const { t } = useI18n();
  return show ? (
    <div role="status" className="alert success">
      <CheckCircle2 size={17} />
      {t("saved")}
    </div>
  ) : null;
}
export function Loading() {
  const { t } = useI18n();
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" size={28} />
      <span>{t("loading")}</span>
    </div>
  );
}
export function Empty({
  title = "noData",
  hint = "noDataHint",
}: {
  title?: string;
  hint?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={26} />
      </span>
      <h3>{t(title)}</h3>
      <p>{t(hint)}</p>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      <span aria-hidden="true" />
      {t(value)}
    </span>
  );
}
export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...props} className={`button ${variant} ${props.className || ""}`}>
      {children}
    </button>
  );
}
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{t("connected")}</p>
        <h1>{t(title)}</h1>
        {subtitle && <p>{t(subtitle)}</p>}
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  children,
  action,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{t(title)}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const { t } = useI18n();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-labelledby={heading}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={heading}>{t(title)}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("close")}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>,
    document.body,
  );
}
export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const generated = useId();
  const id = props.id || generated;
  const { t } = useI18n();
  return (
    <div className="field">
      <label htmlFor={id}>
        {t(label)}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : props["aria-describedby"]}
      />
      {error && (
        <small id={`${id}-error`} className="field-error">
          {t(error)}
        </small>
      )}
    </div>
  );
}
export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generated = useId();
  const id = props.id || generated;
  const { t } = useI18n();
  return (
    <div className="field">
      <label htmlFor={id}>
        {t(label)}
        {props.required && " *"}
      </label>
      <select {...props} id={id}>
        {children}
      </select>
    </div>
  );
}
export function Textarea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const generated = useId();
  const id = props.id || generated;
  const { t } = useI18n();
  return (
    <div className="field">
      <label htmlFor={id}>
        {t(label)}
        {props.required && " *"}
      </label>
      <textarea rows={3} {...props} id={id} />
    </div>
  );
}
export interface FormField {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string; literal?: boolean }[];
  min?: number | string;
  max?: number | string;
  step?: number | string;
  pattern?: string;
  disabled?: boolean;
  autoComplete?: string;
}
export function DataForm({
  fields,
  initial = {},
  onSubmit,
  submit = "save",
  children,
  pending = false,
  error,
}: {
  fields: FormField[];
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, string>) => void;
  submit?: string;
  children?: ReactNode;
  pending?: boolean;
  error?: string;
}) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      Object.entries(initial).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(onSubmit)(e); }} className="form-stack">
      <Alert code={error || (Object.keys(errors).length ? "INVALID_INPUT" : "")} />
      <div className="form-grid">
        {fields.map((field) => {
          const {
            name,
            label = name,
            type = "text",
            options,
            ...attrs
          } = field;
          const bind = register(name, {
            required: attrs.required,
            validate: (value) => {
              if (attrs.disabled || (!value && !attrs.required)) return true;
              let schema: z.ZodType<string> = z.string().refine((v) => !attrs.required || v.trim().length > 0);
              if (type === "email") schema = schema.refine((v) => z.string().email().safeParse(v).success);
              if (attrs.pattern) schema = schema.refine((v) => new RegExp("^(?:" + attrs.pattern + ")$").test(v));
              if (options) schema = schema.refine((v) => options.some((o) => o.value === v));
              return schema.safeParse(value).success || "INVALID_INPUT";
            },
          });
          return (
            <div key={name} className={type === "textarea" ? "full" : ""}>
              {options ? (
                <Select label={label} {...attrs} {...bind}>
                  <option value="">{t("noSelection")}</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.literal ? o.label : t(o.label)}
                    </option>
                  ))}
                </Select>
              ) : type === "textarea" ? (
                <Textarea label={label} required={attrs.required} {...bind} />
              ) : (
                <Field
                  label={label}
                  type={type}
                  {...attrs}
                  {...bind}
                  error={errors[name] ? "required" : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
      {children}
      <div className="form-actions">
        <Button disabled={pending} type="submit">
          {pending ? <LoaderCircle size={17} className="spin" /> : null}
          {t(pending ? "saving" : submit)}
        </Button>
      </div>
    </form>
  );
}
export function Confirm({
  title,
  text,
  onConfirm,
  onClose,
  pending,
  error,
}: {
  title: string;
  text: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  error?: string;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} onClose={onClose}>
      <p>{t(text)}</p>
      <Alert code={error} />
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button variant="danger" disabled={pending} onClick={onConfirm}>
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
