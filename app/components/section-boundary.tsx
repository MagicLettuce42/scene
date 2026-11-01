"use client";
import { Component, type ReactNode } from "react";
export default class SectionBoundary extends Component<{ children: ReactNode; section: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: Readonly<{ children: ReactNode; section: string }>) {
    if (previous.section !== this.props.section && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <div className="error-notice" role="alert">
      <p>This section could not open. Your saved library is kept in your account.</p>
      <button className="button secondary" onClick={() => location.reload()}>Reload Scene</button>
    </div> : this.props.children;
  }
}
