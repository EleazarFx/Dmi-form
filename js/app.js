'use strict';

// Sends the form to the Express API and displays server-side validation errors.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.application-form');
  if (!form) return;

  const statusBox = document.createElement('div');
  statusBox.className = 'form-status';
  statusBox.setAttribute('role', 'status');
  statusBox.setAttribute('aria-live', 'polite');
  form.prepend(statusBox);

  const submitButton = form.querySelector('button[type="submit"]');
  let submitted = false;

  function setStatus(message, type) {
    statusBox.className = `form-status is-${type}`;
    statusBox.textContent = message;
  }

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach((node) => node.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
  }

  function showErrors(errors = {}) {
    Object.entries(errors).forEach(([name, message]) => {
      const controls = Array.from(form.querySelectorAll(`[name="${name}"]`));
      let anchor = null;

      if (controls.length) {
        controls.forEach((control) => control.setAttribute('aria-invalid', 'true'));
        const last = controls[controls.length - 1];
        anchor = last.closest('label, fieldset, .photo-upload') || last.parentElement;
      } else if (name === 'application-number') {
        anchor = form.querySelector('.application-number');
      }

      if (!anchor) return;
      const error = document.createElement('span');
      error.className = 'field-error';
      error.textContent = message;
      anchor.insertAdjacentElement('afterend', error);
    });

    const firstError = form.querySelector('.field-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitted) return;

    clearErrors();
    setStatus('Submitting your application...', 'info');
    submitButton.disabled = true;

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        body: new FormData(form),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        showErrors(result.errors);
        setStatus(result.message || 'The application was not submitted.', 'error');
        return;
      }

      submitted = true;
      const numberField = form.elements['application-number'];
      if (numberField) numberField.value = result.applicationNumber;
      setStatus(`${result.message} Application number: ${result.applicationNumber}.`, 'success');
      submitButton.textContent = 'Application Submitted';

      const newApplication = document.createElement('a');
      newApplication.href = '';
      newApplication.className = 'new-application';
      newApplication.textContent = 'Start a new application';
      statusBox.append(' ', newApplication);
    } catch (error) {
      setStatus('Could not contact the server. Check your connection and try again.', 'error');
    } finally {
      submitButton.disabled = submitted;
    }
  });
});
