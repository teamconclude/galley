export default function Welcome(): React.JSX.Element {
  return (
    <div className="welcome">
      <div className="titlebar" />
      <div className="welcome-body">
        <h1>Galley</h1>
        <p>
          Galley edits the conclude.io website. Open the folder where the site is checked out to get
          started.
        </p>
        <button className="primary" onClick={() => void window.api.repo.choose()}>
          Open site checkout…
        </button>
      </div>
    </div>
  )
}
