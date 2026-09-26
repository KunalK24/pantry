"use client";

import { Component, type ChangeEvent, type SubmitEvent } from "react";

type RecipeFormProps = Record<string, never>;

type RecipeFormState = {
    value: string;
};

export default class RecipeForm extends Component<RecipeFormProps, RecipeFormState> {
    constructor(props: RecipeFormProps) {
        super(props)
        this.state = { value: "" }

        this.handleChange = this.handleChange.bind(this)
        this.handleSubmit = this.handleSubmit.bind(this)
    }

    handleChange(event: ChangeEvent<HTMLInputElement>) {
        this.setState({ value: event.target.value })
    }

    async handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        alert('A recipe was submitted: ' + this.state.value)
        event.preventDefault()

        const recipe = {
            name: this.state.value,
        }

        const response = await fetch('/api/recipes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(recipe),
        })

        if (!response.ok) {
            alert('Failed to submit recipe.')
            return;
        }

        const createdRecipe = await response.json()

        console.log('Created Recipe', createdRecipe)
    }

    render() {
        return (
            <form onSubmit={this.handleSubmit}>
                <label>
                    Recipe Name: 
                    <input type="text" value={this.state.value} onChange={this.handleChange} />
                </label>
                <input type="submit" value="Submit" />
            </form>
        )
    }
}
