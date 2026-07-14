export interface JsonGetter {
  getJson(path: string): Promise<unknown>
}

export interface ProjectSummary {
  id: string
  name: string
  accessLevel: string
}

interface ProjectsResponse {
  projects: Array<{ _id: string; name: string; accessLevel: string }>
}

export class AccountApi {
  readonly #http: JsonGetter

  constructor(http: JsonGetter) {
    this.#http = http
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const response = await this.#http.getJson('/user/projects') as ProjectsResponse
    return response.projects
      .map(project => ({
        id: project._id,
        name: project.name,
        accessLevel: project.accessLevel,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  async authStatus(): Promise<{ authenticated: true; projectCount: number }> {
    const projects = await this.listProjects()
    return { authenticated: true, projectCount: projects.length }
  }
}
