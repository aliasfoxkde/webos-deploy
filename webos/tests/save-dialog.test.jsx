import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import SaveDialog from '../src/shell/SaveDialog.jsx';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const saveBtn = () => [...screen.getAllByRole('button')].find((b) => b.textContent === 'Save');
const cancelBtn = () => [...screen.getAllByRole('button')].find((b) => b.textContent === 'Cancel');

describe('SaveDialog', () => {
  const noop = () => {};

  it('renders with suggested name and directory', () => {
    render(<SaveDialog suggestedName="my-design.png" directory="/Apps/firecraft" format="PNG" onSave={noop} onCancel={noop} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByDisplayValue('my-design.png')).toBeTruthy();
    expect(screen.getByText('/Apps/firecraft')).toBeTruthy();
    expect(screen.getByText('Save PNG as')).toBeTruthy();
  });

  it('renders with default name when none suggested', () => {
    render(<SaveDialog onSave={noop} onCancel={noop} />);
    expect(screen.getByDisplayValue('untitled.png')).toBeTruthy();
  });

  it('calls onSave with the current filename on Save click', () => {
    const save = vi.fn();
    render(<SaveDialog suggestedName="export.png" onSave={save} onCancel={noop} />);
    fireEvent.click(saveBtn());
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith('export.png');
  });

  it('calls onSave with edited filename', () => {
    const save = vi.fn();
    render(<SaveDialog suggestedName="export.png" onSave={save} onCancel={noop} />);
    const input = screen.getByRole('dialog').querySelector('input');
    fireEvent.change(input, { target: { value: 'renamed.png' } });
    fireEvent.click(saveBtn());
    expect(save).toHaveBeenCalledWith('renamed.png');
  });

  it('calls onCancel on Cancel click', () => {
    const cancel = vi.fn();
    render(<SaveDialog suggestedName="export.png" onSave={noop} onCancel={cancel} />);
    fireEvent.click(cancelBtn());
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel on Escape key', () => {
    const cancel = vi.fn();
    render(<SaveDialog suggestedName="export.png" onSave={noop} onCancel={cancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('calls onSave on Enter in the input', () => {
    const save = vi.fn();
    render(<SaveDialog suggestedName="export.png" onSave={save} onCancel={noop} />);
    const input = screen.getByDisplayValue('export.png');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(save).toHaveBeenCalledWith('export.png');
  });

  it('uses untitled.png when name is blank', () => {
    const save = vi.fn();
    render(<SaveDialog suggestedName="" onSave={save} onCancel={noop} />);
    fireEvent.click(saveBtn());
    expect(save).toHaveBeenCalledWith('untitled.png');
  });
});
